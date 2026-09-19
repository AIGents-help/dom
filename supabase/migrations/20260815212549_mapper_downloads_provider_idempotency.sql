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
