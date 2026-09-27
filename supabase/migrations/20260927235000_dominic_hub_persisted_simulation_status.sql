alter table public.dominic_hub_missions
  drop constraint if exists dominic_hub_missions_status_check;

alter table public.dominic_hub_missions
  add constraint dominic_hub_missions_status_check
  check (status in ('ready','running','paused','completed','cancelled'));

create or replace function public.set_dominic_hub_simulation_status_service(
  p_user_id uuid,
  p_mission_id uuid,
  p_status text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_previous text;
begin
  if p_user_id is distinct from (select auth.uid()) then
    raise exception 'HUB mission owner does not match the authenticated user';
  end if;

  if p_status not in ('ready','running','paused','completed','cancelled') then
    raise exception 'Invalid HUB mission status';
  end if;

  select status into v_previous
  from public.dominic_hub_missions
  where id = p_mission_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'HUB mission not found';
  end if;

  if v_previous in ('completed','cancelled') and p_status is distinct from v_previous then
    raise exception 'Completed or cancelled HUB missions are terminal';
  end if;

  if v_previous is not distinct from p_status then
    return v_previous;
  end if;

  update public.dominic_hub_missions
  set status = p_status
  where id = p_mission_id and user_id = p_user_id;

  insert into public.dominic_hub_events (
    user_id, mission_id, event_type, summary, details
  ) values (
    p_user_id,
    p_mission_id,
    'simulation_status_changed',
    case p_status
      when 'running' then 'Simulation mission started'
      when 'paused' then 'Simulation mission paused'
      when 'completed' then 'Simulation mission completed'
      when 'cancelled' then 'Simulation mission cancelled'
      else 'Simulation mission returned to ready'
    end,
    jsonb_build_object('previous_status', v_previous, 'status', p_status)
  );

  return p_status;
end;
$function$;

revoke all on function public.set_dominic_hub_simulation_status_service(uuid,uuid,text) from public, anon;
grant execute on function public.set_dominic_hub_simulation_status_service(uuid,uuid,text) to authenticated, service_role;
