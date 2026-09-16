-- Return an accepted or scheduled mission to DOM staffing without deleting
-- its job, schedule, checklist history, or audit trail. The API authenticates
-- the pilot and supplies that user ID; this function verifies ownership again.
create or replace function public.pilot_return_mission_to_dom(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
begin
  select ma.* into v_assignment
  from public.mission_assignments ma
  join public.contractors c on c.id = ma.contractor_id
  where ma.id = p_assignment_id
    and c.user_id = p_actor_user_id
  for update of ma;

  if not found then
    raise exception 'Mission assignment not found or does not belong to this pilot.';
  end if;
  if v_assignment.status not in ('accepted', 'scheduled') then
    raise exception 'Only an accepted or scheduled mission can be returned. Contact DOM support if field work has started.';
  end if;
  if exists (
    select 1
    from public.payments
    where assignment_id = p_assignment_id
      and status not in ('failed', 'refunded')
  ) then
    raise exception 'This mission already has payment processing. Contact DOM support before changing pilots.';
  end if;

  select * into v_job
  from public.jobs
  where id = v_assignment.job_id
  for update;

  if not found then
    raise exception 'Mission job not found.';
  end if;

  update public.mission_assignments
  set status = 'cancelled',
      decline_reason = coalesce(nullif(btrim(p_reason), ''), 'Returned by pilot for reassignment.')
  where id = p_assignment_id;

  update public.mission_requests
  set status = 'approved',
      claimed_by_contractor_id = null
  where id = v_job.mission_request_id;

  insert into public.mission_activity_events (
    mission_request_id,
    job_id,
    assignment_id,
    actor_user_id,
    actor_role,
    visibility,
    event_type,
    summary,
    details
  ) values (
    v_job.mission_request_id,
    v_job.id,
    p_assignment_id,
    p_actor_user_id,
    'pilot',
    'internal',
    'mission_returned_for_reassignment',
    'Pilot returned mission to DOM for reassignment',
    jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'Not provided'))
  );
end;
$function$;

revoke all on function public.pilot_return_mission_to_dom(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pilot_return_mission_to_dom(uuid, uuid, text) to service_role;
