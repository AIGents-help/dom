-- DOM Mapper MVP — additive schema for pilot-run photogrammetry mapping
-- projects (raw imagery -> NodeODM processing -> deliverables).
--
-- Verified against the live schema before drafting (not guessed):
-- * jobs.id, contractors.id, mission_requests.id, clients.id are all uuid —
--   every FK below matches.
-- * contractors.status, jobs.status, mission_assignments.status are native
--   Postgres enum types (contractor_status, job_status, assignment_status)
--   in this database — mapping_projects.status and
--   mapping_processing_jobs.status follow that same house convention
--   instead of a bare CHECK-constrained text column.
-- * deliverables.type is plain text with NO check constraint anywhere —
--   "extend deliverable type validation" is therefore an application-level
--   change (the DELIVERABLE_TYPES array), not a migration. Nothing here
--   touches the `deliverables` table's schema at all — only new rows will
--   ever be inserted into it, by the worker, once processing completes.
-- * public.is_admin() and public.set_updated_at() already exist in this
--   database — reused below, not redefined.
-- * Real RLS pattern already in production on contractors/jobs/deliverables/
--   mission_assignments: `is_admin()` for admin-full-access, and
--   `exists (select 1 from contractors c where c.id = <fk> and
--   c.user_id = auth.uid())` for contractor-scoped access. Mirrored exactly
--   below rather than invented.
--
-- Safety notes:
-- * Every statement is additive: 6 new tables, 2 new enum types, 1 new
--   storage bucket, 1 new RPC function. Nothing existing is altered,
--   renamed, or dropped.
-- * Fully reversible: DROP TABLE (cascades to policies/triggers), DROP
--   TYPE, DROP FUNCTION, and a storage.buckets delete would cleanly remove
--   everything this file adds (see the rollback note at the bottom).
-- * Per the architecture decision, most pilot-facing writes are expected to
--   go through API routes using the service-role client (bypasses RLS) —
--   the RLS policies below are a defense-in-depth safety net for the
--   contractor-scoped tables, not the primary security boundary. The
--   service-role worker needs no policies of its own (service role bypasses
--   RLS entirely), matching this repo's existing
--   `smartlead_webhook_events` precedent for a service-role-only table.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type public.mapping_project_status as enum (
  'draft', 'uploading', 'uploaded', 'queued', 'processing',
  'completed', 'failed', 'cancelled'
);

create type public.mapping_processing_job_status as enum (
  'queued', 'claimed', 'processing', 'completed', 'failed', 'cancelled'
);

-- ---------------------------------------------------------------------------
-- mapping_projects — the pilot-facing unit of work. Attaches to an existing
-- job + contractor (never a new properties/sites table, per the
-- architecture decision). location_snapshot/latitude/longitude are copied
-- from the job/mission_request at creation time so this record stays
-- meaningful even if upstream mission data later changes.
-- ---------------------------------------------------------------------------

create table public.mapping_projects (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id),
  contractor_id uuid not null references public.contractors (id),
  name text not null,
  location_snapshot text,
  latitude numeric,
  longitude numeric,
  status public.mapping_project_status not null default 'draft',
  image_count integer not null default 0,
  total_upload_bytes bigint not null default 0,
  processing_progress numeric not null default 0,
  processing_stage text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_completed_at timestamptz
);

create index idx_mapping_projects_job_id on public.mapping_projects (job_id);
create index idx_mapping_projects_contractor_id on public.mapping_projects (contractor_id);
create index idx_mapping_projects_status on public.mapping_projects (status);

create trigger mapping_projects_set_updated_at
  before update on public.mapping_projects
  for each row execute function public.set_updated_at();

alter table public.mapping_projects enable row level security;

create policy "admins full access" on public.mapping_projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own mapping projects" on public.mapping_projects
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.contractors c
      where c.id = mapping_projects.contractor_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.contractors c
      where c.id = mapping_projects.contractor_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mapping_images — raw uploaded source imagery for a project. Populated
-- after a direct-to-storage upload completes (see API plan: the browser
-- never writes this table directly with unverified data — a server route
-- confirms the upload and records the row). checksum is used for duplicate
-- detection; the partial unique index below makes that a real DB guarantee,
-- not just an app-level best-effort check.
-- ---------------------------------------------------------------------------

create table public.mapping_images (
  id uuid primary key default gen_random_uuid(),
  mapping_project_id uuid not null references public.mapping_projects (id) on delete cascade,
  storage_path text not null,
  original_filename text,
  file_size bigint,
  mime_type text,
  checksum text,
  sequence_number integer,
  captured_at timestamptz,
  latitude numeric,
  longitude numeric,
  altitude numeric,
  camera_make text,
  camera_model text,
  image_width integer,
  image_height integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_mapping_images_mapping_project_id on public.mapping_images (mapping_project_id);
create unique index idx_mapping_images_project_checksum on public.mapping_images (mapping_project_id, checksum) where checksum is not null;

alter table public.mapping_images enable row level security;

create policy "admins full access" on public.mapping_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own project images" on public.mapping_images
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_images.mapping_project_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_images.mapping_project_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mapping_processing_jobs — the durable processing queue. Postgres itself is
-- the queue (no Redis/BullMQ, per the architecture decision). Two workers
-- cannot claim the same job: see claim_mapping_processing_job() below, which
-- uses `FOR UPDATE SKIP LOCKED` inside a single atomic UPDATE.
-- ---------------------------------------------------------------------------

create table public.mapping_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  mapping_project_id uuid not null references public.mapping_projects (id) on delete cascade,
  status public.mapping_processing_job_status not null default 'queued',
  worker_id text,
  attempts integer not null default 0,
  priority integer not null default 0,
  processor text not null default 'nodeodm',
  processor_version text,
  options jsonb,
  progress numeric not null default 0,
  current_stage text,
  error_message text,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_mapping_processing_jobs_project_id on public.mapping_processing_jobs (mapping_project_id);
create index idx_mapping_processing_jobs_status_priority_queued on public.mapping_processing_jobs (status, priority desc, queued_at) where status = 'queued';
create index idx_mapping_processing_jobs_worker_id on public.mapping_processing_jobs (worker_id);

create trigger mapping_processing_jobs_set_updated_at
  before update on public.mapping_processing_jobs
  for each row execute function public.set_updated_at();

alter table public.mapping_processing_jobs enable row level security;

-- Service-role worker access bypasses RLS entirely and needs no policy
-- (same precedent as smartlead_webhook_events). Pilots/admins only ever
-- READ this table (to show processing status in the UI) — they never
-- claim or mutate a processing job directly, so there is no contractor
-- "manage" policy here, only read visibility scoped through the project.
create policy "admins full access" on public.mapping_processing_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor reads own project processing jobs" on public.mapping_processing_jobs
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_processing_jobs.mapping_project_id and c.user_id = auth.uid()
    )
  );

-- Atomically claims the oldest, highest-priority queued job for a worker.
-- FOR UPDATE SKIP LOCKED means a second worker calling this concurrently
-- will simply skip a row already being claimed rather than block or
-- double-claim it. SECURITY DEFINER + service-role-only usage (this
-- function is only ever called by the worker's service-role client, never
-- exposed to the browser) is intentional, matching the existing
-- calculate_commission_bps()-style RPC precedent in this repo.
create or replace function public.claim_mapping_processing_job(p_worker_id text)
returns public.mapping_processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.mapping_processing_jobs;
begin
  update public.mapping_processing_jobs
  set status = 'claimed', worker_id = p_worker_id, claimed_at = now(), heartbeat_at = now()
  where id = (
    select id from public.mapping_processing_jobs
    where status = 'queued'
    order by priority desc, queued_at asc
    for update skip locked
    limit 1
  )
  returning * into v_job;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- mapping_gcps — ground control points, optional per-project accuracy aids.
-- ---------------------------------------------------------------------------

create table public.mapping_gcps (
  id uuid primary key default gen_random_uuid(),
  mapping_project_id uuid not null references public.mapping_projects (id) on delete cascade,
  label text not null,
  latitude numeric not null,
  longitude numeric not null,
  elevation numeric,
  coordinate_system text,
  is_checkpoint boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_mapping_gcps_mapping_project_id on public.mapping_gcps (mapping_project_id);

create trigger mapping_gcps_set_updated_at
  before update on public.mapping_gcps
  for each row execute function public.set_updated_at();

alter table public.mapping_gcps enable row level security;

create policy "admins full access" on public.mapping_gcps
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own project gcps" on public.mapping_gcps
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_gcps.mapping_project_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_gcps.mapping_project_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mapping_measurements — annotations/measurements a pilot or admin records
-- against a completed map (distances, areas, counts, etc.).
-- ---------------------------------------------------------------------------

create table public.mapping_measurements (
  id uuid primary key default gen_random_uuid(),
  mapping_project_id uuid not null references public.mapping_projects (id) on delete cascade,
  contractor_id uuid references public.contractors (id),
  measurement_type text not null,
  label text,
  value numeric,
  unit text,
  geometry jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_mapping_measurements_mapping_project_id on public.mapping_measurements (mapping_project_id);
create index idx_mapping_measurements_contractor_id on public.mapping_measurements (contractor_id);

create trigger mapping_measurements_set_updated_at
  before update on public.mapping_measurements
  for each row execute function public.set_updated_at();

alter table public.mapping_measurements enable row level security;

create policy "admins full access" on public.mapping_measurements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own project measurements" on public.mapping_measurements
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_measurements.mapping_project_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_measurements.mapping_project_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mapping_events — append-only audit/log trail for a project (uploads
-- started, processing state changes, worker errors, admin actions, etc.).
-- actor_type/actor_id are plain text rather than a FK since the actor can be
-- a pilot, an admin, or the worker itself (no single table covers all
-- three) — same reasoning as lead_activities.created_by elsewhere in this
-- repo.
-- ---------------------------------------------------------------------------

create table public.mapping_events (
  id uuid primary key default gen_random_uuid(),
  mapping_project_id uuid not null references public.mapping_projects (id) on delete cascade,
  actor_type text not null,
  actor_id text,
  event_type text not null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_mapping_events_mapping_project_id on public.mapping_events (mapping_project_id);
create index idx_mapping_events_created_at on public.mapping_events (created_at);

alter table public.mapping_events enable row level security;

create policy "admins full access" on public.mapping_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor reads own project events" on public.mapping_events
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_events.mapping_project_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: dedicated private bucket for raw mapping imagery. Final outputs
-- continue to use the existing mission-deliverables bucket (no new bucket
-- for those) — see the architecture decision. No public bucket is created;
-- all access is via server-issued signed URLs.
--
-- Object path convention mirrors the real, live policy already protecting
-- mission-deliverables (confirmed by inspecting storage.objects policies
-- before writing this): objects are stored as `{mapping_project_id}/...`,
-- and access is scoped by matching that first path segment against a
-- mapping_projects row the requesting contractor owns — same pattern as
-- mission-deliverables' `{job_id}/...` convention, just through
-- mapping_projects directly instead of mission_assignments.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('mapping-uploads', 'mapping-uploads', false)
on conflict (id) do nothing;

create policy "manage mapping uploads" on storage.objects
  for all to authenticated using (
    bucket_id = 'mapping-uploads' and (
      public.is_admin() or exists (
        select 1 from public.mapping_projects mp
        join public.contractors c on c.id = mp.contractor_id
        where mp.id::text = (storage.foldername(objects.name))[1] and c.user_id = auth.uid()
      )
    )
  ) with check (
    bucket_id = 'mapping-uploads' and (
      public.is_admin() or exists (
        select 1 from public.mapping_projects mp
        join public.contractors c on c.id = mp.contractor_id
        where mp.id::text = (storage.foldername(objects.name))[1] and c.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback (not run — reference only, for the approval discussion):
--   drop policy if exists "manage mapping uploads" on storage.objects;
--   drop function if exists public.claim_mapping_processing_job(text);
--   drop table if exists public.mapping_events;
--   drop table if exists public.mapping_measurements;
--   drop table if exists public.mapping_gcps;
--   drop table if exists public.mapping_processing_jobs;
--   drop table if exists public.mapping_images;
--   drop table if exists public.mapping_projects;
--   drop type if exists public.mapping_processing_job_status;
--   drop type if exists public.mapping_project_status;
--   delete from storage.buckets where id = 'mapping-uploads';
-- ---------------------------------------------------------------------------
