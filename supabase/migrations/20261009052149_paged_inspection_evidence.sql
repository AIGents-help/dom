-- Keep page payloads bounded; exact totals and last-page navigation remain available.
-- Page offsets preserve first/last navigation. Deep-page queries still scan skipped
-- index entries; this bounds network/React work rather than claiming O(1) database work.
create index dominic_findings_review_page_idx on public.dominic_findings
(user_id, inspection_id, asset_id, (case when review_status in ('detected','needs_review') then 0 else 1 end),
(case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end), observed_at, id);
create index dominic_media_review_page_idx on public.dominic_inspection_media
(user_id, inspection_id, asset_id, created_at desc, id);
create index dominic_findings_source_page_idx on public.dominic_findings
(user_id, inspection_id, asset_id, (coalesce(detector->>'mediaId', spatial_anchor->>'mediaId')));

create function public.read_dominic_inspection_review(
  p_inspection_id uuid, p_asset_id uuid, p_media_page integer default 0,
  p_finding_page integer default 0, p_filter text default 'all', p_search text default ''
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  media_total bigint; finding_total bigint; matching_total bigint;
  needs_review bigint; confirmed_total bigint;
  media_page integer; finding_page integer;
  search_text text := lower(trim(coalesce(p_search, '')));
  result jsonb;
begin
  if owner_id is null or not exists (select 1 from public.dominic_inspections
    where id = p_inspection_id and asset_id = p_asset_id and user_id = owner_id)
    then return null; end if;
  if p_filter is null or p_filter not in ('all','pending','confirmed','dismissed')
    or p_media_page is null or p_finding_page is null or p_media_page < 0 or p_finding_page < 0
    or length(search_text) > 200 then raise exception 'Invalid review query'; end if;

  select count(*) into media_total from public.dominic_inspection_media
    where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id;
  select count(*), count(*) filter (where review_status = 'needs_review'),
    count(*) filter (where review_status = 'confirmed'),
    count(*) filter (where (p_filter = 'all' or (p_filter = 'pending' and review_status in ('detected','needs_review')) or review_status = p_filter)
      and (search_text = '' or strpos(lower(title || ' ' || coalesce(description, '')), search_text) > 0))
    into finding_total, needs_review, confirmed_total, matching_total
    from public.dominic_findings where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id;
  media_page := least(p_media_page, greatest(0, (media_total - 1) / 12));
  finding_page := least(p_finding_page, greatest(0, (matching_total - 1) / 12));

  with media_rows as materialized (
    select id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,analysis_status,analysis_summary,metadata,created_at from public.dominic_inspection_media
    where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id
    order by created_at desc, id limit 12 offset media_page::bigint * 12
  ), queue_rows as (
    select id,finding_type,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at from public.dominic_findings
    where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id
      and (p_filter = 'all' or (p_filter = 'pending' and review_status in ('detected','needs_review')) or review_status = p_filter)
      and (search_text = '' or strpos(lower(title || ' ' || coalesce(description, '')), search_text) > 0)
    order by case when review_status in ('detected','needs_review') then 0 else 1 end, case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end, observed_at, id limit 12 offset finding_page::bigint * 12
  ), copilot_rows as (
    select id,finding_type,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at from public.dominic_findings
    where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id
      and review_status in ('detected','needs_review') order by case when review_status in ('detected','needs_review') then 0 else 1 end, case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end, observed_at, id limit 12
  ), copilot_sources as (
    select m.id,m.sensor_mode,m.media_type,m.storage_path,m.original_filename,m.mime_type,m.captured_at,m.analysis_status,m.analysis_summary,m.metadata,m.created_at
    from public.dominic_inspection_media m where m.user_id = owner_id and m.inspection_id = p_inspection_id and m.asset_id = p_asset_id
      and m.id::text in (select coalesce(detector->>'mediaId', spatial_anchor->>'mediaId') from copilot_rows)
  ), screening_rows as (
    select id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,analysis_status,analysis_summary,metadata,created_at
    from public.dominic_inspection_media where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id
      and media_type = 'image' and storage_path is not null and sensor_mode in ('rgb','zoom')
      and mime_type in ('image/jpeg','image/png','image/webp') and analysis_status in ('pending','failed')
    order by case when analysis_status = 'failed' then 0 else 1 end, created_at, id limit 12
  ), action_media as (select * from copilot_sources union select * from screening_rows), linked_rows as (
    select m.id as media_id,
      (select count(*) from public.dominic_findings f where f.user_id = owner_id and f.inspection_id = p_inspection_id and f.asset_id = p_asset_id
        and coalesce(f.detector->>'mediaId', f.spatial_anchor->>'mediaId') = m.id::text) as total,
      coalesce((select jsonb_agg(to_jsonb(page)) from (
        select id,finding_type,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at from public.dominic_findings
        where user_id = owner_id and inspection_id = p_inspection_id and asset_id = p_asset_id
          and coalesce(detector->>'mediaId', spatial_anchor->>'mediaId') = m.id::text
        order by case when review_status in ('detected','needs_review') then 0 else 1 end, case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end, observed_at, id limit 12) page), '[]'::jsonb) as findings
    from media_rows m
  ), job_rows as (
    select media_id, status, lease_expires_at, attempt_count, last_error
    from public.dominic_media_screening_jobs where user_id = owner_id and inspection_id = p_inspection_id
      and media_id in (select id from media_rows)
  )
  select jsonb_build_object(
    'media', coalesce((select jsonb_agg(to_jsonb(m)) from media_rows m), '[]'::jsonb),
    'findings', coalesce((select jsonb_agg(to_jsonb(f)) from queue_rows f), '[]'::jsonb),
    'copilotMedia', coalesce((select jsonb_agg(to_jsonb(m)) from action_media m), '[]'::jsonb),
    'copilotFindings', coalesce((select jsonb_agg(to_jsonb(f)) from copilot_rows f), '[]'::jsonb),
    'linkedFindings', coalesce((select jsonb_agg(to_jsonb(f)) from linked_rows f), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j)) from job_rows j), '[]'::jsonb),
    'hasProcessingJobs', exists(select 1 from public.dominic_media_screening_jobs where user_id = owner_id and inspection_id = p_inspection_id and status = 'processing' and lease_expires_at > now()),
    'mediaTotal', media_total, 'findingTotal', finding_total, 'matchingTotal', matching_total,
    'needsReview', needs_review, 'confirmedTotal', confirmed_total,
    'mediaPage', media_page, 'findingPage', finding_page
  ) into result;
  return result;
end;
$$;
revoke all on function public.read_dominic_inspection_review(uuid, uuid, integer, integer, text, text) from public, anon;
grant execute on function public.read_dominic_inspection_review(uuid, uuid, integer, integer, text, text) to authenticated;
