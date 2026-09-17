-- Allow an authenticated DOM Admin route to submit a completed pilot workflow
-- to QC without impersonating the pilot. The route validates admin access,
-- protected readiness gates, and mission-specific deliverable categories first.
create or replace function public.admin_submit_mission_for_qc(
  p_assignment_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_incomplete integer;
begin
  select * into v_assignment
  from public.mission_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'Mission assignment not found';
  end if;
  if v_assignment.status in ('submitted', 'qc_passed', 'paid') then
    return;
  end if;
  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress', 'qc_rejected') then
    raise exception 'Mission is not in a submittable state';
  end if;

  select * into v_job
  from public.jobs
  where id = v_assignment.job_id
  for update;

  if v_job.completed_at is null then
    raise exception 'Mark field capture complete before submitting';
  end if;
  if not exists (
    select 1 from public.deliverables where job_id = v_job.id
  ) then
    raise exception 'Upload the required deliverables before submitting';
  end if;

  select count(*) into v_incomplete
  from public.mission_checklist_items
  where assignment_id = p_assignment_id
    and required
    and not completed
    and item_key <> 'mission_submitted';

  if v_incomplete > 0 then
    raise exception 'Complete or waive every remaining workflow requirement before submitting';
  end if;

  update public.mission_assignments
  set status = 'submitted', submitted_at = now()
  where id = p_assignment_id;

  update public.jobs
  set status = 'qc'
  where id = v_job.id;

  update public.mission_requests
  set status = 'data_review'
  where id = v_job.mission_request_id;

  update public.mission_checklist_items
  set completed = true,
      completed_at = now(),
      notes = 'Submitted to QC by DOM Admin for pilot'
  where assignment_id = p_assignment_id
    and item_key = 'mission_submitted';

  insert into public.mission_activity_events (
    mission_request_id,
    job_id,
    assignment_id,
    actor_user_id,
    actor_role,
    visibility,
    event_type,
    summary
  ) values (
    v_job.mission_request_id,
    v_job.id,
    p_assignment_id,
    p_actor_user_id,
    'admin',
    'shared',
    'mission_submitted_by_admin',
    'DOM Admin submitted the completed pilot workflow for QC'
  );
end;
$function$;

revoke all on function public.admin_submit_mission_for_qc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_submit_mission_for_qc(uuid, uuid) to service_role;

-- Apply an Admin checklist resolution and its audit event atomically. System-backed
-- safety and submission items remain immutable through this override path.
create or replace function public.admin_set_mission_checklist_item(
  p_assignment_id uuid,
  p_item_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item public.mission_checklist_items%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_completed boolean;
  v_summary text;
begin
  if p_action not in ('complete', 'waive', 'reopen') then
    raise exception 'Invalid workflow action';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A brief Admin reason is required';
  end if;

  select * into v_item from public.mission_checklist_items
  where id = p_item_id and assignment_id = p_assignment_id for update;
  if not found then raise exception 'Checklist item not found'; end if;
  if v_item.item_key in ('uav_assigned', 'insurance_verified', 'capture_complete', 'deliverables_uploaded', 'mission_submitted') then
    raise exception 'This requirement is controlled by verified mission data';
  end if;

  select * into v_assignment from public.mission_assignments where id = p_assignment_id;
  if not found then raise exception 'Mission assignment not found'; end if;
  select * into v_job from public.jobs where id = v_assignment.job_id;
  if not found then raise exception 'Mission job not found'; end if;

  v_completed := p_action <> 'reopen';
  v_summary := case p_action
    when 'waive' then v_item.label || ': waived by DOM'
    when 'reopen' then v_item.label || ': reopened by DOM'
    else v_item.label || ': completed for pilot by DOM'
  end;

  update public.mission_checklist_items
  set completed = v_completed,
      completed_at = case when v_completed then now() else null end,
      notes = case p_action
        when 'waive' then 'Waived by DOM Admin: ' || trim(p_reason)
        when 'reopen' then 'Reopened by DOM Admin: ' || trim(p_reason)
        else 'Completed for pilot by DOM Admin: ' || trim(p_reason)
      end
  where id = p_item_id;

  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id, actor_role,
    visibility, event_type, summary, details
  ) values (
    v_job.mission_request_id, v_job.id, p_assignment_id, p_actor_user_id, 'admin',
    'shared', 'workflow_' || p_action, v_summary,
    jsonb_build_object('item_key', v_item.item_key, 'reason', trim(p_reason))
  );
end;
$function$;

revoke all on function public.admin_set_mission_checklist_item(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_mission_checklist_item(uuid, uuid, uuid, text, text) to service_role;
