-- All confirmation records commit together. Provider/model IO is never inside this transaction.
-- Asset -> finding -> issue is the common lock order for confirmation requests.
create function public.commit_dominic_finding_review(
  p_finding_id uuid, p_user_id uuid, p_action text, p_plan jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  f public.dominic_findings%rowtype;
  a public.dominic_assets%rowtype;
  i public.dominic_issues%rowtype;
  asset_id_before uuid;
  linked_issue uuid;
  expected_issue uuid := (p_plan->>'expectedIssueId')::uuid;
  target_issue uuid := (p_plan->>'targetedIssueId')::uuid;
  issue_key_value text := p_plan->>'issueKey';
  issue_values jsonb := p_plan->'issueValues';
  event_values jsonb := p_plan->'event';
  linked_at_value timestamptz := coalesce((p_plan->>'linkedAt')::timestamptz, clock_timestamp());
  source_media text;
  condition_value text;
  reused boolean := false;
begin
  if p_action is null or p_action not in ('confirm','dismiss') then raise exception 'Invalid review action'; end if;
  select * into f from public.dominic_findings where id = p_finding_id and user_id = p_user_id;
  if not found then return jsonb_build_object('notFound', true); end if;
  asset_id_before := f.asset_id;
  select * into a from public.dominic_assets where id = asset_id_before and user_id = p_user_id for no key update;
  if not found then return jsonb_build_object('notFound', true); end if;
  select * into f from public.dominic_findings where id = p_finding_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('notFound', true); end if;
  if f.asset_id <> asset_id_before then return jsonb_build_object('retry', true); end if;
  perform 1 from public.dominic_inspections where id = f.inspection_id and user_id = p_user_id and asset_id = f.asset_id for share;
  if not found then return jsonb_build_object('notFound', true); end if;

  if p_action = 'dismiss' then
    update public.dominic_findings set review_status = 'dismissed' where id = f.id and user_id = p_user_id;
    return jsonb_build_object('findingId', f.id, 'status', 'dismissed');
  end if;
  select issue_id into linked_issue from public.dominic_issue_findings
    where finding_id = f.id and user_id = p_user_id order by linked_at, issue_id limit 1;
  if linked_issue is not null then
    if not exists (select 1 from public.dominic_issues where id = linked_issue and user_id = p_user_id and asset_id = f.asset_id)
      then raise exception 'Issue ownership mismatch'; end if;
    update public.dominic_findings set review_status = 'confirmed' where id = f.id and user_id = p_user_id and review_status <> 'confirmed';
    return jsonb_build_object('findingId', f.id, 'status', 'confirmed', 'issueId', linked_issue, 'alreadyLinked', true, 'reusedIssue', true);
  end if;
  if not exists (select 1 from public.dominic_inspections where id = f.inspection_id and user_id = p_user_id
    and asset_id = f.asset_id and updated_at = (p_plan->>'expectedInspectionUpdatedAt')::timestamptz)
    then return jsonb_build_object('retry', true); end if;
  if f.updated_at is distinct from (p_plan->>'expectedFindingUpdatedAt')::timestamptz
    then return jsonb_build_object('retry', true); end if;

  if target_issue is not null then
    select * into i from public.dominic_issues where id = target_issue and user_id = p_user_id and asset_id = f.asset_id
      and status in ('open','monitoring','in_progress','resolved') for update;
  end if;
  if i.id is null then
    select * into i from public.dominic_issues where user_id = p_user_id and asset_id = f.asset_id and issue_key = issue_key_value
      and status in ('open','monitoring','in_progress') order by last_seen_at desc, id limit 1 for update;
  end if;
  if i.id is distinct from expected_issue or (i.id is not null and i.updated_at is distinct from (p_plan->>'expectedIssueUpdatedAt')::timestamptz)
    then return jsonb_build_object('retry', true); end if;

  if i.id is not null then
    reused := true;
    update public.dominic_issues set current_finding_id = f.id,
      severity = issue_values->>'severity', confidence = (issue_values->>'confidence')::numeric,
      recommended_action = issue_values->>'recommended_action', last_seen_at = f.observed_at,
      metadata = issue_values->'metadata'
      where id = i.id and user_id = p_user_id;
  else
    insert into public.dominic_issues(user_id,asset_id,first_finding_id,current_finding_id,issue_key,issue_type,
      title,description,severity,status,confidence,recommended_action,first_seen_at,last_seen_at,metadata)
    values (p_user_id,f.asset_id,f.id,f.id,issue_key_value,f.finding_type,f.title,f.description,
      issue_values->>'severity','open',(issue_values->>'confidence')::numeric,issue_values->>'recommended_action',
      f.observed_at,f.observed_at,issue_values->'metadata') returning * into i;
  end if;
  update public.dominic_findings set review_status = 'confirmed' where id = f.id and user_id = p_user_id;
  insert into public.dominic_issue_findings(user_id,issue_id,finding_id,inspection_id,relation_type,linked_at)
    values(p_user_id,i.id,f.id,f.inspection_id,case when reused then 'progression' else 'discovered' end,linked_at_value);
  source_media := coalesce(f.detector->>'mediaId', f.spatial_anchor->>'mediaId');
  insert into public.dominic_finding_evidence(user_id,finding_id,evidence_type,storage_path,source_table,source_id,mime_type,captured_at,metadata)
    select p_user_id,f.id,coalesce(f.sensor_mode,'image'),m.storage_path,'dominic_inspection_media',m.id,m.mime_type,m.captured_at,
      m.metadata || jsonb_build_object('spatialAnchor',f.spatial_anchor,'issueKey',issue_key_value)
    from public.dominic_inspection_media m where m.id::text = source_media and m.user_id = p_user_id
      and m.inspection_id = f.inspection_id and m.asset_id = f.asset_id;
  condition_value := case f.severity when 'critical' then 'critical' when 'high' then 'degraded' when 'medium' then 'watch' else null end;
  if condition_value is not null and
    array_position(array['unknown','normal','watch','degraded','critical'],condition_value) >
    coalesce(array_position(array['unknown','normal','watch','degraded','critical'],a.condition_state),1) then
    update public.dominic_assets set condition_state = condition_value, condition_updated_at = linked_at_value
      where id = a.id and user_id = p_user_id;
  end if;
  -- A failing history/evidence/condition write raises out of the function and rolls
  -- back every preceding write. Do not catch and convert these errors into success.
  insert into public.dominic_issue_events(user_id,issue_id,inspection_id,finding_id,event_type,summary,details)
    values(p_user_id,i.id,f.inspection_id,f.id,event_values->>'event_type',event_values->>'summary',event_values->'details');
  return jsonb_build_object('findingId',f.id,'status','confirmed','issueId',i.id,'alreadyLinked',false,'reusedIssue',reused);
end;
$$;
revoke all on function public.commit_dominic_finding_review(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.commit_dominic_finding_review(uuid,uuid,text,jsonb) to service_role;
