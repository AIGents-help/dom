# DOM Mapper Worker

Independent Node process that turns queued DOM Mapper projects into finished
orthomosaics / 3D models / point clouds via [NodeODM](https://github.com/OpenDroneMap/NodeODM).
Runs completely outside the Next.js app and outside Vercel — this is meant
for a local DOM processing workstation with real CPU/GPU/disk to spare.

## How it fits together

```
Supabase (queue)                DOM Mapper worker              NodeODM
─────────────────                ──────────────────              ───────
mapping_processing_jobs  <────   claim_mapping_processing_job()
  (status='queued')               (atomic, FOR UPDATE SKIP LOCKED)
                                  ↓
mapping_images            ────>  download raw imagery
                                  ↓
                                  extract EXIF (authoritative)
                                  ↓
                                  submit task                ────>  /task/new/init
                                                                     /task/new/commit
                                  poll progress               <────  /task/{uuid}/info
                                  ↓
                                  download all.zip            <────  /task/{uuid}/download/all.zip
                                  ↓
mission-deliverables       <────  upload extracted outputs
deliverables (rows)        <────  register orthomosaic/3d_model/dsm/dtm/point_cloud
                                  ↓
mapping_projects           <────  mark completed / failed
```

Postgres is the queue — no Redis/BullMQ. `claim_mapping_processing_job()`
guarantees two workers can never claim the same job (single atomic `UPDATE`
using `FOR UPDATE SKIP LOCKED`). A worker that dies mid-job is recovered
automatically: any job still `claimed`/`processing` with a heartbeat older
than 10 minutes gets requeued (or marked `failed` after 3 attempts) by
`recoverStaleJobs()`, which every worker runs at the start of each poll tick.

## Prerequisites

- Node.js 18+ (native `fetch`/`FormData`/`Blob` — no HTTP client dependency needed)
- A running NodeODM instance reachable from this machine. Easiest local setup:
  ```
  docker run -p 3001:3000 opendronemap/nodeodm
  ```
- The Supabase project's **service-role key** (Project Settings → API in the dashboard) — this worker runs entirely server-side/trusted, never in a browser.

## Setup

```
cd services/mapper-worker
npm install
cp .env.example .env.local
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPPER_WORKER_ID, MAPPER_WORK_DIR
npm start
```

`MAPPER_WORK_DIR` should point at a real directory with enough free disk
space for a job's raw imagery plus NodeODM's output (a few GB per project is
realistic for a few hundred images) — the worker creates one subdirectory
per job under it and deletes that subdirectory when the job finishes,
success or failure.

`MAPPER_WORKER_ID` just needs to be unique-ish and stable — the workstation
hostname is a reasonable choice. It shows up in the pilot UI's processing
status and in `mapping_processing_jobs.worker_id`.

Nothing in this worker has a baked-in default path or credential — it
refuses to start if any required env var (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `MAPPER_WORKER_ID`, `MAPPER_WORK_DIR`) is
missing.

## Running

- `npm start` — run once, polling every `MAPPER_POLL_INTERVAL_MS` (default 10s) for queued work.
- `npm run dev` — same, but restarts on source changes (useful while developing the worker itself).
- `Ctrl+C` — finishes whatever's mid-tick, then exits cleanly (`SIGINT`/`SIGTERM` handled).

Run more than one instance (even on different machines, as long as they can
all reach the same NodeODM and Supabase project) to process jobs in
parallel — the atomic claim function is what makes that safe.

## What's real vs. a known limitation right now

- Output file discovery (`src/extractOutputs.ts`) searches NodeODM's
  `all.zip` by directory-name hint + file extension rather than one
  hard-coded path per output type, since exact filenames (e.g. `.obj` vs
  `.glb` for the textured model) vary across ODM versions/options. If a
  particular NodeODM setup produces an output this doesn't recognize, that
  one output type is simply skipped (logged, not a hard failure) rather than
  guessed at.
- EXIF extraction (`src/extractMetadata.ts`) uses whatever `exifr` can read
  from each image — images without embedded GPS/camera metadata will have
  those `mapping_images` columns stay null, which is expected, not a bug.
- Processing options (the NodeODM `options` array passed on
  `mapping_processing_jobs.options`) are currently whatever the caller sets
  when queuing — the pilot UI doesn't yet expose a way to pick ODM options
  (e.g. fast-orthophoto, resolution); it queues with an empty array,
  meaning NodeODM's own defaults apply.
