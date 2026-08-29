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

## Google Drive setup (optional — required for the Drive archive layer)

Everything in `src/googleDrive.ts` is wired up and shipped, but it stays
off (falls back to the original Supabase-only path) until you do this
one-time, interactive setup in the Google Cloud / Drive consoles — nothing
here can be done from code or CLI on your behalf:

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, enable the **Google Drive API** for it, then create a
   **Service Account** (IAM & Admin → Service Accounts → Create).
2. On that service account, create a **JSON key** and download it. Copy its
   `client_email` into `GOOGLE_DRIVE_CLIENT_EMAIL` and its `private_key`
   into `GOOGLE_DRIVE_PRIVATE_KEY` (both in `.env.local` here, and the same
   two vars in the main app's `.env.local`/Vercel project settings — the app
   needs read access to stream downloads, the worker needs write access to
   upload).
3. In Google Drive, create a **Shared Drive** (recommended — a service
   account has no storage quota of its own on a regular "My Drive", so a
   plain shared folder can silently fail on upload) named e.g. "DOM Drone
   Operations Archive", and add the service account's email as a **Member**
   with **Content Manager** access.
4. Copy that Shared Drive's id (the part of its URL after
   `/drive/folders/`) into both `GOOGLE_DRIVE_ROOT_PARENT_ID` and
   `GOOGLE_DRIVE_SHARED_DRIVE_ID`.
5. Restart the worker (and redeploy the app, if `GOOGLE_DRIVE_CLIENT_EMAIL`/
   `GOOGLE_DRIVE_PRIVATE_KEY` changed there too). The next processing job
   creates `DOM Drone Operations/Customers/<Customer>/<Job - Date>/01_Raw_Images/`
   etc. under that Shared Drive automatically and reuses the same folders on
   every subsequent job/retry (cached on `mapping_projects.drive_folder_ids`).

If any of `GOOGLE_DRIVE_CLIENT_EMAIL` / `GOOGLE_DRIVE_PRIVATE_KEY` /
`GOOGLE_DRIVE_ROOT_PARENT_ID` is unset, `isDriveConfigured()` returns false
and processing jobs upload to `mission-deliverables` exactly as before this
feature — nothing breaks either way.

## Point cloud viewer conversion (optional — required for the Potree viewer)

`src/convertPointCloud.ts` shells out to
[PotreeConverter](https://github.com/potree/PotreeConverter) 2.x to turn
each point_cloud output's LAZ into the compact 3-file 2.x octree format
(`metadata.json`/`octree.bin`/`hierarchy.bin`), uploaded to the private
`mapper-potree` Supabase Storage bucket (always Supabase regardless of
where the master LAZ itself ends up, so the viewer gets Range-request-
capable signed URLs — see the bucket's migration comment). Install
PotreeConverter on this machine and either put it on `PATH` as
`PotreeConverter` or set `POTREE_CONVERTER_PATH` to its full path. Missing
means this step is skipped (logged) and the point_cloud deliverable stays
LAZ-only — not a hard failure, and doesn't block any other output.

## Orthomosaic COG tiling (optional — required for fast pan/zoom on large orthomosaics)

If `gdal_translate`/`gdaladdo` are available (`GDAL_TRANSLATE_PATH`/
`GDAL_ADDO_PATH`, default `gdal_translate`/`gdaladdo` on `PATH`), the
orthomosaic output is re-encoded as a tiled Cloud-Optimized GeoTIFF with
overviews before upload, so the browser viewer can fetch only the
resolution/tiles it needs instead of the whole file. Missing means the
original GeoTIFF is uploaded as-is (still fully downloadable, just without
fast partial-resolution loading in the viewer for very large files).

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
- Processing options (the NodeODM `options` array on
  `mapping_processing_jobs.options`) are now set by the pilot's processing
  profile choice (Quick Test/Standard/High Detail/Survey — see
  `PROCESSING_PROFILES` in the main app's `lib/mapperPipeline.ts` and
  `MappingProcessingStatus.tsx`), translated server-side at queue time.
- Google Drive archiving, Potree conversion, and orthomosaic COG tiling are
  all real but opt-in — each is skipped (logged, not a hard failure) until
  its respective binary/credentials are configured on this machine. See the
  three setup sections above.
