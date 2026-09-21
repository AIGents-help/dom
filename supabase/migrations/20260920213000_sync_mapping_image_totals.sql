create or replace function public.sync_mapping_project_image_totals()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_new_project_id uuid;
  v_old_project_id uuid;
begin
  v_new_project_id := case when tg_op <> 'DELETE' then new.mapping_project_id else null end;
  v_old_project_id := case when tg_op <> 'INSERT' then old.mapping_project_id else null end;

  if v_new_project_id is not null then
    update public.mapping_projects p
    set
      image_count = totals.image_count,
      total_upload_bytes = totals.total_upload_bytes,
      updated_at = now()
    from (
      select
        count(*)::integer as image_count,
        coalesce(sum(coalesce(mi.file_size, 0)), 0)::bigint as total_upload_bytes
      from public.mapping_images mi
      where mi.mapping_project_id = v_new_project_id
    ) totals
    where p.id = v_new_project_id;
  end if;

  if v_old_project_id is not null and v_old_project_id is distinct from v_new_project_id then
    update public.mapping_projects p
    set
      image_count = totals.image_count,
      total_upload_bytes = totals.total_upload_bytes,
      updated_at = now()
    from (
      select
        count(*)::integer as image_count,
        coalesce(sum(coalesce(mi.file_size, 0)), 0)::bigint as total_upload_bytes
      from public.mapping_images mi
      where mi.mapping_project_id = v_old_project_id
    ) totals
    where p.id = v_old_project_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_mapping_project_image_totals() from public, anon, authenticated;
grant execute on function public.sync_mapping_project_image_totals() to service_role;

drop trigger if exists mapping_images_sync_project_totals on public.mapping_images;
create trigger mapping_images_sync_project_totals
after insert or update of mapping_project_id, file_size or delete
on public.mapping_images
for each row
execute function public.sync_mapping_project_image_totals();

update public.mapping_projects p
set
  image_count = totals.image_count,
  total_upload_bytes = totals.total_upload_bytes,
  updated_at = now()
from (
  select
    mp.id,
    count(mi.id)::integer as image_count,
    coalesce(sum(coalesce(mi.file_size, 0)), 0)::bigint as total_upload_bytes
  from public.mapping_projects mp
  left join public.mapping_images mi on mi.mapping_project_id = mp.id
  group by mp.id
) totals
where p.id = totals.id
  and (
    p.image_count is distinct from totals.image_count
    or p.total_upload_bytes is distinct from totals.total_upload_bytes
  );
