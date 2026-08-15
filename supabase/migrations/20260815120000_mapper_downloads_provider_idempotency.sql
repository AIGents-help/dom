-- Fixes the Mapping-tab Download button and preps `deliverables` for the
-- upcoming Google Drive storage backend. Purely additive: no existing
-- column touched, no row deleted. Two independent things:
--
-- 1. storage_provider/external_file_id let the download code branch on
--    backend per-row instead of hard-coding Supabase Storage. Every
--    existing row (including the live Toledo/roof_inspection_commercial
--    deliverables) is explicitly backfilled to 'supabase', which is what
--    they actually are today -- nothing about their download behavior
--    changes.
-- 2. mapping_processing_job_id + a partial unique index on
--    (mapping_processing_job_id, type) makes worker output registration
--    idempotent: a requeued/retried processing job (see
--    recoverStaleJobs.ts) reuses the same mapping_processing_jobs.id, so a
--    second registerDeliverable() call for the same job+type now hits the
--    unique index instead of inserting a duplicate row. Existing duplicate
--    rows (e.g. the two live "3D Model" deliverables on job
--    44ea08d4-7f48-401d-a192-9ea831f2bebf) predate this column, are left
--    at NULL, and are intentionally not touched here -- deduplication of
--    those is a display-layer concern (see lib/mapperPipeline.ts), not a
--    data migration.

alter table public.deliverables
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists external_file_id text,
  add column if not exists mapping_processing_job_id uuid references public.mapping_processing_jobs (id);

comment on column public.deliverables.storage_provider is
  'Which backend storage_url/external_file_id resolve against: supabase (storage_url is a mission-deliverables bucket path, the original behavior) or google_drive (external_file_id below). Every pre-existing row is explicitly supabase.';
comment on column public.deliverables.external_file_id is
  'Google Drive file id, once that backend is wired up. Null for storage_provider = supabase.';
comment on column public.deliverables.mapping_processing_job_id is
  'The mapping_processing_jobs row that produced this deliverable, when it came from the mapper worker (null for admin-uploaded/manual deliverables). Paired with the unique index below to make output registration idempotent across worker retries.';

update public.deliverables set storage_provider = 'supabase' where storage_provider is null;

create unique index if not exists deliverables_processing_job_type_uidx
  on public.deliverables (mapping_processing_job_id, type)
  where mapping_processing_job_id is not null;
