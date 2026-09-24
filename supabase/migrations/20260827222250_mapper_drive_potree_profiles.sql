alter table public.mapping_projects
  add column if not exists drive_folder_ids jsonb;

comment on column public.mapping_projects.drive_folder_ids is
  'Cache of resolved Google Drive folder ids for this project, keyed by folder name (customer, job, and each of the 6 deliverable subfolders). Populated once by the worker on first use via googleDrive.ts''s find-or-create; read from here first on every subsequent call so retries never create duplicate folders.';

alter table public.mapping_images
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists external_file_id text;

comment on column public.mapping_images.storage_provider is
  'supabase (storage_path in the mapping-uploads bucket, the original upload path -- browsers still upload here via TUS) or google_drive (external_file_id below, set by the worker after migrating the file during processing). storage_path stays populated either way for historical/audit purposes.';
comment on column public.mapping_images.external_file_id is
  'Google Drive file id, once the worker has copied this raw image into the project''s 01_Raw_Images Drive folder. Null until storage_provider = google_drive.';

update public.mapping_images set storage_provider = 'supabase' where storage_provider is null;

alter table public.deliverables
  add column if not exists potree jsonb;

comment on column public.deliverables.potree is
  'Potree 2.x converted octree for a point_cloud deliverable: {"provider":"supabase"|"google_drive","metadata":"<path or file id>","octree":"<path or file id>","hierarchy":"<path or file id>"}. Null until the worker''s PotreeConverter step has run for this deliverable (requires PotreeConverter on the worker machine -- see services/mapper-worker/README.md). Irrelevant for non-point_cloud deliverable types.';

alter table public.mapping_processing_jobs
  add column if not exists profile text;

comment on column public.mapping_processing_jobs.profile is
  'Which processing profile (quick_test/standard/high_detail/survey -- see PROCESSING_PROFILES in lib/mapperPipeline.ts) this job was queued with. Null for jobs queued before profiles existed; options (already a column) is always the authoritative ODM options actually submitted regardless of this label.';
