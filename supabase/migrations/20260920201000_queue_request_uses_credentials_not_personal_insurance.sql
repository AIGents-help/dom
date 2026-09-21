create or replace function public.pilot_request_mission_service(
  p_mission_request_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_contractor public.contractors%rowtype;
  v_mission public.mission_requests%rowtype;
  v_missing text[];
  v_requirement_count integer;
  v_id uuid;
begin
  select * into v_contractor
  from public.contractors
  where user_id = p_actor_user_id;

  if not found then
    raise exception 'no contractor profile for this account';
  end if;

  if v_contractor.status <> 'active' or not v_contractor.part107_verified then
    raise exception 'pilot credentials are not current — active account and verified Part 107 required';
  end if;

  select * into v_mission
  from public.mission_requests
  where id = p_mission_request_id;

  if not found then
    raise exception 'mission not found';
  end if;

  select count(*) into v_requirement_count
  from public.mission_capability_requirements
  where service_type = v_mission.service_type;

  if v_requirement_count = 0 then
    raise exception 'mission equipment requirements are not configured';
  end if;

  select array_agg(r.capability order by r.capability)
  into v_missing
  from public.mission_capability_requirements r
  where r.service_type = v_mission.service_type
    and r.required
    and not exists (
      select 1
      from public.pilot_assets a
      join public.pilot_asset_capabilities c on c.asset_id = a.id
      where a.contractor_id = v_contractor.id
        and a.status = 'active'
        and a.archived_at is null
        and a.capabilities_verified
        and c.capability = r.capability
    );

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'pilot equipment is missing required capabilities: %', array_to_string(v_missing, ', ');
  end if;

  update public.mission_requests
  set status = 'claimed',
      claimed_by_contractor_id = v_contractor.id
  where id = p_mission_request_id
    and status = 'approved'
    and claimed_by_contractor_id is null
  returning id into v_id;

  if v_id is null then
    raise exception 'mission is no longer available';
  end if;
end;
$function$;

revoke all on function public.pilot_request_mission_service(uuid,uuid) from public, anon, authenticated;
grant execute on function public.pilot_request_mission_service(uuid,uuid) to service_role;

comment on function public.pilot_request_mission_service(uuid,uuid) is
  'Allows active Part 107-verified pilots with required equipment to request an open mission. Insurance/coverage is resolved before admin assignment and field readiness, not at marketplace request time.';
