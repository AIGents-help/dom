update public.mapping_projects p
set image_count = s.image_count,
    total_upload_bytes = s.total_upload_bytes,
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
  and (
    p.image_count is distinct from s.image_count
    or p.total_upload_bytes is distinct from s.total_upload_bytes
  );
