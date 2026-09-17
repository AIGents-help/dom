create or replace function public.pilot_acknowledge_uninsured_responsibility(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_terms_version text,
  p_user_agent text default null,
  p_forwarded_for text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_contractor public.contractors%rowtype;
begin
  if p_actor_user_id is null or coalesce(trim(p_terms_version), '') = '' then
    raise exception 'A signed acknowledgement and terms version are required';
  end if;

  select * into v_assignment
  from public.mission_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found';
  end if;

  select * into v_contractor
  from public.contractors
  where id = v_assignment.contractor_id;

  if v_contractor.user_id is distinct from p_actor_user_id then
    raise exception 'Only the assigned pilot may acknowledge uninsured responsibility';
  end if;

  select * into v_job from public.jobs where id = v_assignment.job_id;
  select * into v_mission from public.mission_requests where id = v_job.mission_request_id;

  if v_mission.created_by_contractor_id is distinct from v_assignment.contractor_id
     or v_mission.requires_admin_approval then
    raise exception 'The uninsured option is limited to pilot-created self-service missions';
  end if;

  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress') then
    raise exception 'This assignment can no longer change its insurance path';
  end if;

  update public.mission_assignments
  set insurance_source = 'pilot_uninsured_acknowledgement',
      mission_insurance_verified = false,
      mission_insurance_reference = p_terms_version,
      mission_insurance_expires_at = null,
      mission_insurance_coi_path = null
  where id = p_assignment_id;

  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_mission.id, v_job.id, v_assignment.id, p_actor_user_id,
    'pilot', 'shared', 'uninsured_responsibility_acknowledged',
    'Pilot elected to proceed without a verified insurance policy',
    jsonb_build_object(
      'terms_version', p_terms_version,
      'user_agent', p_user_agent,
      'forwarded_for', p_forwarded_for
    )
  );
end;
$$;

revoke all on function public.pilot_acknowledge_uninsured_responsibility(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.pilot_acknowledge_uninsured_responsibility(uuid, uuid, text, text, text) to service_role;
