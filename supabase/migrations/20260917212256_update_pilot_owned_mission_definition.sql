create or replace function public.pilot_update_owned_mission_definition(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_service_type text,
  p_scope text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contractor public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_title text := nullif(btrim(p_title), '');
  v_service_type text := nullif(btrim(p_service_type), '');
  v_scope text := nullif(btrim(p_scope), '');
begin
  select * into v_contractor
  from public.contractors
  where user_id = p_actor_user_id;

  if not found then
    raise exception 'Pilot profile not found';
  end if;

  select * into v_assignment
  from public.mission_assignments
  where id = p_assignment_id
    and contractor_id = v_contractor.id
  for update;

  if not found then
    raise exception 'Mission assignment not found';
  end if;

  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress') then
    raise exception 'Mission scope can only be changed before submission';
  end if;

  select * into v_job
  from public.jobs
  where id = v_assignment.job_id
  for update;

  select * into v_mission
  from public.mission_requests
  where id = v_job.mission_request_id
  for update;

  if v_mission.created_by_contractor_id is distinct from v_contractor.id
     or v_job.delivery_responsibility is distinct from 'pilot' then
    raise exception 'Only the owner can change a pilot-created mission';
  end if;

  if v_title is null or char_length(v_title) > 160 then
    raise exception 'Mission name must be between 1 and 160 characters';
  end if;

  if v_service_type is null or v_service_type not in (
    'roof_inspection_residential', 'roof_inspection_commercial',
    'construction_progress', 'thermal_inspection', 'ortho_survey',
    'powerline_inspection', 'real_estate_media', 'custom'
  ) then
    raise exception 'Select a valid mission type';
  end if;

  if v_scope is not null and char_length(v_scope) > 5000 then
    raise exception 'Mission scope cannot exceed 5000 characters';
  end if;

  update public.mission_requests
  set service_type = v_service_type,
      scope = v_scope
  where id = v_mission.id;

  update public.jobs
  set title = v_title,
      service_type = v_service_type
  where id = v_job.id;

  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_mission.id, v_job.id, v_assignment.id, p_actor_user_id,
    'pilot', 'shared', 'pilot_mission_definition_updated',
    'Pilot owner updated the mission name, type, or scope',
    jsonb_build_object(
      'before', jsonb_build_object('title', v_job.title, 'service_type', v_job.service_type, 'scope', v_mission.scope),
      'after', jsonb_build_object('title', v_title, 'service_type', v_service_type, 'scope', v_scope)
    )
  );
end;
$$;

revoke all on function public.pilot_update_owned_mission_definition(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.pilot_update_owned_mission_definition(uuid, uuid, text, text, text) to service_role;
