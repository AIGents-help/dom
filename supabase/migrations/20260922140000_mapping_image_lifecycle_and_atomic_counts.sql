-- Make mapping image summaries concurrency-safe and persist per-image lifecycle status.

alter table public.mapping_images
  add column if not exists lifecycle_status text not null default 'stored',
  add column if not exists lifecycle_error text,
  add column if not exists lifecycle_updated_at timestamptz not null default now();

alter table public.mapping_images
  drop constraint if exists mapping_images_lifecycle_status_check;

alter table public.mapping_images
  add constraint mapping_images_lifecycle_status_check
  check (lifecycle_status in (
    'stored',
    'downloading',
    'downloaded',
    'metadata_checked',
    'processor_uploading',
    'processing',
    'processed',
    'failed'
  ));

create or replace function public.sync_mapping_project_image_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.mapping_projects
      set image_count = image_count + 1,
          total_upload_bytes = total_upload_bytes + coalesce(new.file_size, 0),
          updated_at = now()
      where id = new.mapping_project_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.mapping_projects
      set image_count = greatest(image_count - 1, 0),
          total_upload_bytes = greatest(total_upload_bytes - coalesce(old.file_size, 0), 0),
          updated_at = now()
      where id = old.mapping_project_id;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.mapping_project_id = old.mapping_project_id then
      if new.file_size is distinct from old.file_size then
        update public.mapping_projects
          set total_upload_bytes = greatest(total_upload_bytes - coalesce(old.file_size, 0) + coalesce(new.file_size, 0), 0),
              updated_at = now()
          where id = new.mapping_project_id;
      end if;
    else
      update public.mapping_projects
        set image_count = greatest(image_count - 1, 0),
            total_upload_bytes = greatest(total_upload_bytes - coalesce(old.file_size, 0), 0),
            updated_at = now()
        where id = old.mapping_project_id;
      update public.mapping_projects
        set image_count = image_count + 1,
            total_upload_bytes = total_upload_bytes + coalesce(new.file_size, 0),
            updated_at = now()
        where id = new.mapping_project_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_mapping_images_project_summary on public.mapping_images;
create trigger trg_mapping_images_project_summary
after insert or delete or update of file_size, mapping_project_id
on public.mapping_images
for each row execute function public.sync_mapping_project_image_summary();

-- Backfill every project from authoritative image rows so historic races are repaired.
update public.mapping_projects p
set image_count = coalesce(s.image_count, 0),
    total_upload_bytes = coalesce(s.total_upload_bytes, 0),
    updated_at = now()
from (
  select mp.id,
         count(mi.id)::int as image_count,
         coalesce(sum(mi.file_size), 0)::bigint as total_upload_bytes
  from public.mapping_projects mp
  left join public.mapping_images mi on mi.mapping_project_id = mp.id
  group by mp.id
) s
where p.id = s.id
  and (p.image_count is distinct from s.image_count
       or p.total_upload_bytes is distinct from s.total_upload_bytes);

create index if not exists idx_mapping_images_project_lifecycle
  on public.mapping_images(mapping_project_id, lifecycle_status);
