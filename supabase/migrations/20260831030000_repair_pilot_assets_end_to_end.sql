-- Make equipment eligibility and mission equipment selection authoritative.

alter table public.pilot_assets
  add column if not exists capabilities_verified boolean not null default false,
  add column if not exists capabilities_verified_at timestamptz;

comment on column public.pilot_assets.capabilities_verified is
  'DOM-admin verification that the asset capability tags are suitable for mission matching. Pilot capability edits clear this flag.';

create or replace function public.pilot_request_mission(p_mission_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor public.contractors%rowtype;
  v_mission public.mission_requests%rowtype;
  v_missing text[];
  v_requirement_count integer;
  v_id uuid;
begin
  select * into v_contractor from public.contractors where user_id = (select auth.uid());
  if not found then raise exception 'no contractor profile for this account'; end if;
  if v_contractor.status <> 'active' or not v_contractor.part107_verified or not v_contractor.insurance_verified then
    raise exception 'pilot is not verified — Part 107 and insurance both required';
  end if;

  select * into v_mission from public.mission_requests where id = p_mission_request_id;
  if not found then raise exception 'mission not found'; end if;

  select count(*) into v_requirement_count
  from public.mission_capability_requirements
  where service_type = v_mission.service_type;
  if v_requirement_count = 0 then
    raise exception 'mission equipment requirements are not configured';
  end if;

  select array_agg(r.capability order by r.capability) into v_missing
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
  set status = 'claimed', claimed_by_contractor_id = v_contractor.id
  where id = p_mission_request_id and status = 'approved' and claimed_by_contractor_id is null
  returning id into v_id;
  if v_id is null then raise exception 'mission is no longer available'; end if;
end;
$$;

revoke all on function public.pilot_request_mission(uuid) from public, anon;
grant execute on function public.pilot_request_mission(uuid) to authenticated;

create or replace function public.pilot_replace_mission_assets(
  p_mission_assignment_id uuid,
  p_asset_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor_id uuid;
  v_service_type text;
  v_valid_ids uuid[];
  v_missing text[];
  v_requirement_count integer;
  v_aircraft_label text;
  v_aircraft_count integer;
begin
  select ma.contractor_id, j.service_type
  into v_contractor_id, v_service_type
  from public.mission_assignments ma
  join public.jobs j on j.id = ma.job_id
  join public.contractors c on c.id = ma.contractor_id
  where ma.id = p_mission_assignment_id and c.user_id = (select auth.uid());
  if not found then raise exception 'assignment not found'; end if;

  select coalesce(array_agg(a.id order by a.id), '{}'::uuid[])
  into v_valid_ids
  from public.pilot_assets a
  where a.contractor_id = v_contractor_id
    and a.id = any(coalesce(p_asset_ids, '{}'::uuid[]))
    and a.status = 'active' and a.archived_at is null;
  if cardinality(v_valid_ids) <> cardinality(coalesce(p_asset_ids, '{}'::uuid[])) then
    raise exception 'one or more selected assets are unavailable or do not belong to this pilot';
  end if;

  select count(*) into v_requirement_count
  from public.mission_capability_requirements where service_type = v_service_type;
  if v_requirement_count = 0 then raise exception 'mission equipment requirements are not configured'; end if;

  select array_agg(r.capability order by r.capability) into v_missing
  from public.mission_capability_requirements r
  where r.service_type = v_service_type and r.required
    and not exists (
      select 1 from public.pilot_asset_capabilities c
      join public.pilot_assets a on a.id = c.asset_id
      where c.asset_id = any(v_valid_ids) and a.capabilities_verified and c.capability = r.capability
    );
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'selected equipment is missing required capabilities: %', array_to_string(v_missing, ', ');
  end if;

  select count(*) into v_aircraft_count
  from public.pilot_assets a where a.id = any(v_valid_ids) and a.asset_type = 'uav';
  if v_aircraft_count = 0 then raise exception 'select at least one active UAV for this mission'; end if;

  delete from public.mission_asset_assignments where mission_assignment_id = p_mission_assignment_id;
  insert into public.mission_asset_assignments (mission_assignment_id, asset_id, role)
  select p_mission_assignment_id, a.id,
    case when a.asset_type = 'uav' then 'aircraft' else 'support' end
  from public.pilot_assets a where a.id = any(v_valid_ids);

  select string_agg(coalesce(nullif(a.display_name, ''), nullif(concat_ws(' ', a.manufacturer, a.model), ''), a.asset_type), ', ' order by a.id)
  into v_aircraft_label
  from public.pilot_assets a where a.id = any(v_valid_ids) and a.asset_type = 'uav';
  update public.mission_assignments set assigned_uav = v_aircraft_label where id = p_mission_assignment_id;
  return v_valid_ids;
end;
$$;

revoke all on function public.pilot_replace_mission_assets(uuid, uuid[]) from public, anon;
grant execute on function public.pilot_replace_mission_assets(uuid, uuid[]) to authenticated;

-- Custom missions must be explicitly configured before entering equipment matching.
-- Do not seed a permissive default requirement.
