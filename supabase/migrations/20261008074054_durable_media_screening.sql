-- Claims and final writes are short transactions; provider IO happens between them.
create table public.dominic_media_screening_jobs (
  media_id uuid primary key references public.dominic_inspection_media(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_id uuid not null references public.dominic_inspections(id) on delete cascade,
  status text not null check (status in ('processing', 'succeeded', 'failed')),
  run_id uuid not null default gen_random_uuid(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  finished_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  last_error text
);
create index dominic_media_screening_jobs_owner_inspection_idx
  on public.dominic_media_screening_jobs(user_id, inspection_id);
alter table public.dominic_media_screening_jobs enable row level security;
revoke all on public.dominic_media_screening_jobs from public, anon, authenticated;
grant select on public.dominic_media_screening_jobs to authenticated;
grant all on public.dominic_media_screening_jobs to service_role;
create policy "Owners read screening jobs" on public.dominic_media_screening_jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- Preserve completed screenings from before durable jobs were introduced.
insert into public.dominic_media_screening_jobs(media_id, user_id, inspection_id, status,
  lease_expires_at, finished_at, result)
select id, user_id, inspection_id, 'succeeded', now(), now(), analysis_summary
from public.dominic_inspection_media
where analysis_status in ('review', 'complete')
  and analysis_summary ? 'analyzedAt' and analysis_summary ? 'summary';

create function public.claim_dominic_media_screening(p_media_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  m public.dominic_inspection_media%rowtype;
  j public.dominic_media_screening_jobs%rowtype;
begin
  select * into m from public.dominic_inspection_media
    where id = p_media_id and user_id = p_user_id for update;
  if not found or not exists (
    select 1 from public.dominic_inspections
    where id = m.inspection_id and user_id = p_user_id and asset_id = m.asset_id
  ) then raise exception 'Inspection media not found'; end if;

  select * into j from public.dominic_media_screening_jobs where media_id = m.id for update;
  if found then
    if j.user_id <> p_user_id or j.inspection_id <> m.inspection_id then
      raise exception 'Screening job ownership mismatch';
    end if;
    if j.status = 'succeeded' then
      return jsonb_build_object('decision', 'cached', 'result', j.result);
    end if;
    if j.status = 'processing' and j.lease_expires_at > clock_timestamp() then
      return jsonb_build_object('decision', 'busy', 'leaseExpiresAt', j.lease_expires_at);
    end if;
    update public.dominic_media_screening_jobs set
      status = 'processing', run_id = gen_random_uuid(), attempt_count = attempt_count + 1,
      started_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes',
      finished_at = null, result = '{}'::jsonb, last_error = null
      where media_id = m.id returning * into j;
  else
    insert into public.dominic_media_screening_jobs(media_id, user_id, inspection_id, status, lease_expires_at)
      values (m.id, p_user_id, m.inspection_id, 'processing', clock_timestamp() + interval '5 minutes')
      returning * into j;
  end if;
  update public.dominic_inspection_media set analysis_status = 'analyzing' where id = m.id;
  update public.dominic_inspections set status = 'analyzing'
    where id = m.inspection_id and status in ('planned', 'capturing');
  return jsonb_build_object('decision', 'claimed', 'runId', j.run_id,
    'leaseExpiresAt', j.lease_expires_at, 'attemptCount', j.attempt_count);
end;
$$;

create function public.finish_dominic_media_screening(
  p_media_id uuid, p_user_id uuid, p_run_id uuid, p_summary jsonb,
  p_candidates jsonb, p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  m public.dominic_inspection_media%rowtype;
  j public.dominic_media_screening_jobs%rowtype;
begin
  select * into m from public.dominic_inspection_media
    where id = p_media_id and user_id = p_user_id for update;
  if not found then return false; end if;
  select * into j from public.dominic_media_screening_jobs where media_id = m.id for update;
  if not found or j.user_id <> p_user_id or j.inspection_id <> m.inspection_id
    or j.run_id <> p_run_id or j.status <> 'processing'
    or j.lease_expires_at <= clock_timestamp() then return false; end if;
  if p_error is not null then
    update public.dominic_media_screening_jobs set status = 'failed', finished_at = clock_timestamp(),
      last_error = left(p_error, 500) where media_id = m.id;
    update public.dominic_inspection_media set analysis_status = 'failed', analysis_summary = p_summary
      where id = m.id;
    return true;
  end if;

  insert into public.dominic_findings(user_id, inspection_id, asset_id, finding_type,
    title, description, severity, review_status, confidence, sensor_mode, fingerprint,
    latitude, longitude, spatial_anchor, detector, observed_at)
  select distinct on (c.fingerprint) p_user_id, m.inspection_id, m.asset_id, c.finding_type, c.title, c.description,
    c.severity, 'needs_review', c.confidence, m.sensor_mode, c.fingerprint,
    c.latitude, c.longitude, c.spatial_anchor, c.detector, coalesce(c.observed_at, clock_timestamp())
  from jsonb_to_recordset(p_candidates) as c(finding_type text, title text, description text,
    severity text, confidence numeric, fingerprint text, latitude numeric, longitude numeric,
    spatial_anchor jsonb, detector jsonb, observed_at timestamptz)
  where not exists (select 1 from public.dominic_findings f where f.user_id = p_user_id
    and f.inspection_id = m.inspection_id and f.fingerprint = c.fingerprint)
  order by c.fingerprint;

  update public.dominic_inspection_media set analysis_status = 'review', analysis_summary = p_summary
    where id = m.id;
  update public.dominic_inspections set status = 'review',
    ai_summary = coalesce(ai_summary, '{}'::jsonb) || p_summary || jsonb_build_object('latestMediaId', m.id)
    where id = m.inspection_id and user_id = p_user_id;
  update public.dominic_media_screening_jobs set status = 'succeeded', result = p_summary,
    finished_at = clock_timestamp(), last_error = null where media_id = m.id;
  return true;
end;
$$;
revoke all on function public.claim_dominic_media_screening(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_dominic_media_screening(uuid, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_dominic_media_screening(uuid, uuid) to service_role;
grant execute on function public.finish_dominic_media_screening(uuid, uuid, uuid, jsonb, jsonb, text) to service_role;
