-- The revision is advanced before source writes, under the inspection row lock.
-- Verification takes the same lock, then reads a fresh complete snapshot.
alter table public.dominic_inspections add column verification_revision bigint not null default 0;

create function public.advance_dominic_verification_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.verification_revision := old.verification_revision + 1;
  return new;
end;
$$;
create trigger dominic_inspection_verification_revision before update on public.dominic_inspections
for each row execute function public.advance_dominic_verification_revision();

create function public.touch_dominic_verification_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  old_inspection uuid; old_owner uuid; old_asset uuid;
  new_inspection uuid; new_owner uuid; new_asset uuid;
  parent_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_inspection := old.inspection_id; old_owner := old.user_id; old_asset := old.asset_id;
  end if;
  if tg_op <> 'DELETE' then
    new_inspection := new.inspection_id; new_owner := new.user_id; new_asset := new.asset_id;
  end if;
  -- Moving a source touches both parents in a deterministic order.
  for parent_id in select id from public.dominic_inspections
    where (id = old_inspection and user_id = old_owner and asset_id = old_asset)
       or (id = new_inspection and user_id = new_owner and asset_id = new_asset)
    order by id for no key update
  loop
    update public.dominic_inspections set verification_revision = verification_revision + 1 where id = parent_id;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger dominic_finding_verification_revision before insert or update or delete on public.dominic_findings
for each row execute function public.touch_dominic_verification_source();
create trigger dominic_media_verification_revision before insert or update or delete on public.dominic_inspection_media
for each row execute function public.touch_dominic_verification_source();
revoke all on function public.advance_dominic_verification_revision() from public, anon, authenticated;
revoke all on function public.touch_dominic_verification_source() from public, anon, authenticated;
grant execute on function public.advance_dominic_verification_revision() to service_role;
grant execute on function public.touch_dominic_verification_source() to service_role;

-- Aggregate every owned row in one snapshot; returned finding detail stays bounded.
-- Exact counts scan the inspection's index entries, not an API-limited first page.
create or replace function public.read_dominic_issue_verification(p_issue_id uuid, p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned_issue as materialized (
    select i.id,i.asset_id,i.title,i.severity,i.status,i.recommended_action,i.resolution_notes,
      i.resolved_at,i.verified_at,i.metadata,i.updated_at
    from public.dominic_issues i join public.dominic_assets a on a.id = i.asset_id and a.user_id = p_user_id
    where i.id = p_issue_id and i.user_id = p_user_id
  ), verification_inspection as materialized (
    select s.id,s.status,s.objective,s.summary,s.ai_summary,s.completed_at,s.created_at,s.verification_revision
    from public.dominic_inspections s join owned_issue i on s.id::text = i.metadata->>'verificationInspectionId'
      and s.asset_id = i.asset_id where s.user_id = p_user_id
  ), owned_findings as materialized (
    select f.id,f.title,f.severity,f.review_status,f.detector,f.observed_at
    from public.dominic_findings f join verification_inspection s on s.id = f.inspection_id
      join owned_issue i on i.asset_id = f.asset_id where f.user_id = p_user_id
  ), finding_counts as (
    select count(*) as total, count(*) filter (where review_status in ('detected','needs_review')) as pending,
      count(*) filter (where review_status = 'confirmed') as confirmed,
      count(*) filter (where review_status = 'dismissed') as dismissed,
      coalesce(jsonb_agg(distinct case when lower(detector->>'comparisonState') in ('improving','unchanged','worsening')
        then lower(detector->>'comparisonState') else 'unknown' end
        order by case when lower(detector->>'comparisonState') in ('improving','unchanged','worsening')
          then lower(detector->>'comparisonState') else 'unknown' end)
        filter (where review_status = 'confirmed'), '[]'::jsonb) as comparison_states from owned_findings
  ), owned_media as materialized (
    select m.analysis_status,m.media_type,m.analysis_summary,
      case when jsonb_typeof(m.analysis_summary->'candidateCount') = 'number' then
        case when (m.analysis_summary->>'candidateCount')::numeric >= 0
          and trunc((m.analysis_summary->>'candidateCount')::numeric) = (m.analysis_summary->>'candidateCount')::numeric
          then (m.analysis_summary->>'candidateCount')::numeric end
      end as candidate_count
    from public.dominic_inspection_media m join verification_inspection s on s.id = m.inspection_id
      join owned_issue i on i.asset_id = m.asset_id where m.user_id = p_user_id
  ), media_counts as (
    select count(*) as total, count(*) filter (where analysis_status not in ('review','complete')) as unfinished,
      count(*) filter (where media_type <> 'image' or candidate_count is null
        or (analysis_summary->'baselineCompared') is distinct from 'true'::jsonb
        or coalesce(analysis_summary->'comparisonComparability'->>'level','unknown') not in ('medium','high')) as invalid_comparison,
      coalesce(sum(candidate_count),0) as screened_candidates from owned_media
  ), finding_sample as (
    select id,title,severity,review_status,detector from owned_findings
    order by case when review_status in ('detected','needs_review') then 0 else 1 end,
      case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
      observed_at,id limit 12
  )
  select jsonb_build_object('issue',to_jsonb(i),
    'verificationInspection',(select to_jsonb(s) from verification_inspection s),
    'verificationFindings',coalesce((select jsonb_agg(to_jsonb(f)) from finding_sample f),'[]'::jsonb),
    'verificationCounts',jsonb_build_object('total',f.total,'pending',f.pending,'confirmed',f.confirmed,'dismissed',f.dismissed,
      'comparisonStates',f.comparison_states,'mediaTotal',m.total,'unfinished',m.unfinished,
      'invalidComparison',m.invalid_comparison,'screenedCandidates',m.screened_candidates))
  from owned_issue i cross join finding_counts f cross join media_counts m;
$$;
revoke all on function public.read_dominic_issue_verification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_dominic_issue_verification(uuid,uuid) to service_role;

-- Asset -> inspection -> issue. Source rows are never locked by this transaction:
-- source writers wait on the inspection BEFORE their changes become visible.
create function public.commit_dominic_issue_lifecycle(
  p_issue_id uuid, p_user_id uuid, p_action text, p_plan jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  i public.dominic_issues%rowtype;
  asset_before uuid;
  values_plan jsonb := p_plan->'issueValues';
  event_plan jsonb := p_plan->'event';
  event_inspection uuid := (event_plan->>'inspectionId')::uuid;
  verification_inspection uuid;
  snapshot jsonb;
  desired_status text;
  next_resolved timestamptz;
  next_verified timestamptz;
  next_notes text;
  expected_event text;
  parent_id uuid;
  verification_id_before text;
begin
  desired_status := case p_action when 'start_maintenance' then 'in_progress'
    when 'complete_maintenance' then 'resolved' when 'verification_started' then 'resolved'
    when 'verify' then 'verified' when 'verification_failed' then 'in_progress' end;
  expected_event := case p_action when 'start_maintenance' then 'maintenance_started'
    when 'complete_maintenance' then 'maintenance_completed' when 'verification_started' then 'verification_started'
    when 'verify' then 'maintenance_verified' when 'verification_failed' then 'verification_failed' end;
  if desired_status is null or event_plan->>'eventType' is distinct from expected_event
    or jsonb_typeof(values_plan->'metadata') is distinct from 'object'
    then raise exception 'Invalid lifecycle plan'; end if;
  select * into i from public.dominic_issues where id = p_issue_id and user_id = p_user_id;
  if not found then return jsonb_build_object('notFound',true); end if;
  asset_before := i.asset_id;
  perform 1 from public.dominic_assets where id = asset_before and user_id = p_user_id for no key update;
  if not found then return jsonb_build_object('notFound',true); end if;
  -- Source deletion may update an issue through its finding foreign keys, so
  -- inspection locks precede the issue lock here too.
  select * into i from public.dominic_issues where id = p_issue_id and user_id = p_user_id;
  if not found then return jsonb_build_object('notFound',true); end if;
  verification_id_before := i.metadata->>'verificationInspectionId';
  if p_action in ('verify','verification_failed') then
    select id into verification_inspection from public.dominic_inspections
      where id::text = verification_id_before and user_id = p_user_id and asset_id = asset_before;
  end if;
  if event_inspection is not null and not exists (select 1 from public.dominic_inspections
    where id = event_inspection and user_id = p_user_id and asset_id = asset_before)
    then return jsonb_build_object('notFound',true); end if;
  for parent_id in select id from public.dominic_inspections
    where user_id = p_user_id and asset_id = asset_before and id in (verification_inspection,event_inspection)
    order by id for update
  loop null; end loop;
  select * into i from public.dominic_issues where id = p_issue_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('notFound',true); end if;
  if i.asset_id is distinct from asset_before or i.updated_at is distinct from (p_plan->>'expectedIssueUpdatedAt')::timestamptz
    then return jsonb_build_object('conflict',true); end if;
  if (p_action in ('start_maintenance','complete_maintenance') and i.status not in ('open','monitoring','in_progress'))
    or (p_action in ('verification_started','verify','verification_failed') and i.status <> 'resolved')
    then return jsonb_build_object('conflict',true); end if;

  if p_action in ('verify','verification_failed') then
    if i.metadata->>'verificationInspectionId' is distinct from verification_id_before then return jsonb_build_object('conflict',true); end if;
    -- Failure can be recorded without a verification inspection; successful closure cannot.
    if p_action = 'verify' and verification_inspection is null then return jsonb_build_object('conflict',true); end if;
    select public.read_dominic_issue_verification(p_issue_id,p_user_id) into snapshot;
    if jsonb_build_object('inspection',snapshot->'verificationInspection','counts',snapshot->'verificationCounts')
      is distinct from p_plan->'expectedVerification' then return jsonb_build_object('conflict',true); end if;
  end if;
  if p_action = 'verification_started' and (event_inspection is null or
    values_plan->'metadata'->>'verificationInspectionId' is distinct from event_inspection::text)
    then raise exception 'Verification inspection mismatch'; end if;
  if p_action in ('verify','verification_failed') and event_inspection is distinct from verification_inspection
    then raise exception 'Verification event mismatch'; end if;
  if coalesce(values_plan->>'status',i.status) <> desired_status then raise exception 'Lifecycle status mismatch'; end if;
  next_resolved := case when values_plan ? 'resolved_at' then (values_plan->>'resolved_at')::timestamptz else i.resolved_at end;
  next_verified := case when values_plan ? 'verified_at' then (values_plan->>'verified_at')::timestamptz else i.verified_at end;
  next_notes := case when values_plan ? 'resolution_notes' then values_plan->>'resolution_notes' else i.resolution_notes end;
  if i.status = desired_status and i.metadata = values_plan->'metadata'
    and i.resolved_at is not distinct from next_resolved and i.verified_at is not distinct from next_verified
    and i.resolution_notes is not distinct from next_notes then
    return jsonb_build_object('alreadyApplied',true);
  end if;
  update public.dominic_issues set status = desired_status, metadata = values_plan->'metadata',
    resolved_at = next_resolved, verified_at = next_verified, resolution_notes = next_notes
    where id = i.id and user_id = p_user_id;
  -- No exception handler: failed history rolls the issue update back.
  insert into public.dominic_issue_events(user_id,issue_id,inspection_id,event_type,summary,details)
    values(p_user_id,i.id,event_inspection,expected_event,event_plan->>'summary',coalesce(event_plan->'details','{}'::jsonb));
  return jsonb_build_object('committed',true);
end;
$$;
revoke all on function public.commit_dominic_issue_lifecycle(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.commit_dominic_issue_lifecycle(uuid,uuid,text,jsonb) to service_role;
