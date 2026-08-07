# DOM Mapper

Pilot-run photogrammetry: raw drone imagery → NodeODM processing → orthomosaic
/ 3D model / point cloud, registered into DOM's existing deliverables and QC
workflow. Lives inside the existing Pilot Dashboard as a "Mapping" tab.

Note: an earlier, untracked `INSTALL.md` in this repo referred to mapper
files that didn't actually exist — this document supersedes it. `INSTALL.md`
is left as-is rather than deleted, since it wasn't this build's file to
remove.

## Architecture

- **Pilot UI**: `app/pilot/page.tsx` gains one new tab (`"mapping"`, behind
  `NEXT_PUBLIC_MAPPER_ENABLED` — same "ship dark, flip flag" pattern as the
  existing Queue tab), rendering `components/mapper/MappingTab.tsx`. All
  mapper components live under `components/mapper/`, using the pilot
  dashboard's existing inline-style visual system (not Tailwind — that's the
  admin side's convention).
- **API**: `app/api/pilot/mapping/**` — six routes, every one gated by
  `lib/pilotAuth.ts`'s `resolveContractor()` (Bearer token → Supabase user →
  `contractors` row by `user_id` → status check). `contractor_id` is never
  taken from the browser.
- **Pure logic**: `lib/mapperPipeline.ts` — status vocab, upload/queue
  eligibility, stale-job detection, formatting. Framework-free, unit tested.
- **Database**: six new tables (`mapping_projects`, `mapping_images`,
  `mapping_processing_jobs`, `mapping_gcps`, `mapping_measurements`,
  `mapping_events`), two new enums, one RPC
  (`claim_mapping_processing_job`), one new private Storage bucket
  (`mapping-uploads`). See Database below.
- **Worker**: `services/mapper-worker/` — an independent Node process, not
  part of the Next.js app or Vercel deployment. See its own README for setup.

## Why mapping projects attach to `jobs`, not a new `properties` table

No `properties`/`sites` table exists in this MVP, on purpose. A
`mapping_projects` row attaches to an existing `job_id` + `contractor_id`
(both real FKs), and reaches `mission_requests`/`clients` indirectly through
that job when needed. `location_snapshot`/`latitude`/`longitude` are copied
onto the mapping project at creation time specifically so the record stays
meaningful even if the upstream job/mission data changes later — it's a
snapshot, not a live join.

## Database

Migration: `supabase/migrations/20260807000900_add_dom_mapper_tables.sql`
(additive only — 6 tables, 2 enums, 1 RPC, 1 storage bucket + policy; no
existing table altered, no DROPs). Applied and verified against the live
database.

Key decisions, each verified against the live schema before being made
(not assumed):

- **`mapping_project_status`/`mapping_processing_job_status` are native
  Postgres enums**, not CHECK-constrained text — matching this database's
  actual convention (`contractor_status`, `job_status`, `assignment_status`
  are all real enums here; an earlier migration this week wrongly assumed
  `leads.status` was plain text when it's also an enum, so this one was
  checked first).
- **`deliverables.type` has no DB constraint at all** (verified) — extending
  accepted output types (`dsm`, `dtm`, `processing_report` added;
  `orthomosaic`/`3d_model`/`point_cloud` already existed) is purely the
  app-level `DELIVERABLE_TYPES` array in `app/admin/missions/[id]/page.tsx`.
- **RLS mirrors the real, live policies** already on `contractors`/`jobs`/
  `deliverables`/`mission_assignments` — `is_admin()` (an existing function)
  for admin, `EXISTS (SELECT 1 FROM contractors c WHERE c.id = <fk> AND
  c.user_id = auth.uid())` for contractor-scoped access. `set_updated_at()`
  also already existed and is reused, not redefined.
- **`smartlead_webhook_events`-style precedent**: `mapping_processing_jobs`
  gets no contractor "manage" RLS policy (only read), and
  `smartlead_webhook_events`... — the worker uses the service-role key and
  bypasses RLS entirely regardless, so no browser-facing policy is needed
  for it to function.
- **Storage folder convention verified, not invented**: the real
  `storage.objects` policy on `mission-deliverables` scopes access by
  matching the object path's first folder segment against a `job_id` the
  contractor has an accepted assignment for. `mapping-uploads` mirrors this
  exactly (`{mapping_project_id}/...`), and finished outputs uploaded to
  `mission-deliverables` follow the same `{job_id}/...` shape
  (`{job_id}/mapper/{filename}`).

### Pipeline stages

Project: `draft → uploading → uploaded → queued → processing → completed |
failed | cancelled`. Processing job: `queued → claimed → processing →
completed | failed | cancelled`.

## Storage

- `mapping-uploads` (new, private) — raw source imagery only.
- `mission-deliverables` (existing, private) — finished outputs. No second
  finished-output system.
- Uploads are direct-to-storage via Supabase's officially documented
  resumable (TUS) protocol (`tus-js-client`), never through a Vercel
  function body. Chunk size is fixed at 6MB per Supabase's own requirement.
- Downloads (both raw imagery in the worker, and finished outputs in the
  pilot UI) use signed URLs / the service-role client — no public bucket
  anywhere in this feature.

## Processing queue

Postgres/Supabase is the queue — no Redis/BullMQ. `claim_mapping_processing_job(worker_id)`
is a single atomic `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)`,
so two workers can never claim the same row. A worker that dies mid-job is
recovered by `recoverStaleJobs()` (run by every worker at the start of each
poll tick): any job stuck at `claimed`/`processing` with a heartbeat older
than 10 minutes is requeued, up to 3 attempts, then marked `failed`.

## NodeODM integration

Every endpoint and field used in `services/mapper-worker/src/nodeodm.ts` was
verified against OpenDroneMap/NodeODM's actual API documentation before
being implemented:

- `POST /task/new/init` (multipart images + options) → `{uuid}`
- `POST /task/new/commit/{uuid}` — starts processing
- `GET /task/{uuid}/info` → `{uuid, status: {code}, progress, imagesCount, ...}`;
  status codes `10 QUEUED / 20 RUNNING / 30 FAILED / 40 COMPLETED / 50 CANCELED`
- `GET /task/{uuid}/download/all.zip` — the **only** documented download
  asset (there's no per-artifact endpoint for just the orthophoto, etc.)

Because `all.zip` bundles ODM's whole output tree and exact filenames vary
by ODM version/options, `extractOutputs.ts` locates files by directory-name
hint + extension rather than one hard-coded path — an output type it can't
find is simply skipped (logged), not a hard failure.

## Local testing

- `npm test` runs `lib/mapperPipeline.test.ts` along with the rest of the
  suite (status vocab, upload/queue eligibility, stale-job detection,
  formatting).
- `npx tsc --noEmit` and `npm run build` cover the Next.js app.
- The worker has its own `npm run typecheck` inside `services/mapper-worker/`.
- Full end-to-end local testing needs: the migration applied, a real
  NodeODM instance reachable (`docker run -p 3001:3000 opendronemap/nodeodm`),
  `NEXT_PUBLIC_MAPPER_ENABLED=true`, a pilot account with an accepted
  assignment on some job, and the worker running against that same Supabase
  project. See `services/mapper-worker/README.md` for the worker side.

## Deployment

1. Apply `supabase/migrations/20260807000900_add_dom_mapper_tables.sql`.
2. Set `NEXT_PUBLIC_MAPPER_ENABLED=true` when ready to show the tab to pilots.
3. Deploy the Next.js app as usual (Vercel) — the pilot UI and API routes
   ship with it.
4. Run `services/mapper-worker` **separately**, on a machine with NodeODM
   reachable — it is never deployed to Vercel.

## Known limitations / next checkpoint

- **Viewers are structure-only.** `OrthomosaicViewer`/`Model3DViewer`/`PointCloudViewer`
  have real props/data contracts (a signed URL, a name) but no real
  map/3D/point-cloud rendering yet (no MapLibre/three.js/Potree dependency
  added this pass, deliberately — see the architecture decision).
- **No GCP or measurement UI yet**, though `mapping_gcps` and
  `mapping_measurements` tables + RLS exist and are ready for it.
- **No ODM processing-options picker in the UI** — projects queue with
  NodeODM's defaults; `mapping_processing_jobs.options` is ready to carry
  per-project overrides once that UI exists.
- **Email-drift-style limitation**: output type detection depends on ODM's
  conventional directory layout; a NodeODM/ODM version with a substantially
  different output structure could produce zero recognized outputs for one
  or more types (logged clearly, not silently wrong).
