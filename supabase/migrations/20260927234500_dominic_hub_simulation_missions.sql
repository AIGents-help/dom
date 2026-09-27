create table if not exists public.dominic_hub_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mission_type text not null check (mission_type in ('surveillance','thermal_inspection','ldar','emergency_recon')),
  aircraft_label text not null,
  route_mode text not null,
  recurrence_label text not null default 'ONE-TIME SIMULATION',
  scheduled_local_time time not null default '06:00',
  status text not null default 'ready' check (status in ('ready','paused','completed','cancelled')),
  simulation_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_hub_missions_user_updated_idx
  on public.dominic_hub_missions(user_id, updated_at desc);

create table if not exists public.dominic_hub_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid references public.dominic_hub_missions(id) on delete cascade,
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dominic_hub_events_user_created_idx
  on public.dominic_hub_events(user_id, created_at desc);

alter table public.dominic_hub_missions enable row level security;
alter table public.dominic_hub_events enable row level security;

grant select, insert, update, delete on table public.dominic_hub_missions to authenticated;
grant select, insert on table public.dominic_hub_events to authenticated;
grant all on table public.dominic_hub_missions to service_role;
grant all on table public.dominic_hub_events to service_role;

drop policy if exists "Users manage own DOMINIC HUB missions" on public.dominic_hub_missions;
create policy "Users manage own DOMINIC HUB missions"
  on public.dominic_hub_missions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own DOMINIC HUB events" on public.dominic_hub_events;
create policy "Users read own DOMINIC HUB events"
  on public.dominic_hub_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own DOMINIC HUB events" on public.dominic_hub_events;
create policy "Users create own DOMINIC HUB events"
  on public.dominic_hub_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop trigger if exists dominic_hub_missions_set_updated_at on public.dominic_hub_missions;
create trigger dominic_hub_missions_set_updated_at
  before update on public.dominic_hub_missions
  for each row execute function public.set_updated_at();

create or replace function public.save_dominic_hub_simulation_service(
  p_user_id uuid,
  p_name text,
  p_mission_type text,
  p_aircraft_label text,
  p_route_mode text,
  p_recurrence_label text,
  p_scheduled_local_time time
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mission_id uuid;
begin
  if p_user_id is distinct from (select auth.uid()) then
    raise exception 'HUB mission owner does not match the authenticated user';
  end if;

  insert into public.dominic_hub_missions (
    user_id, name, mission_type, aircraft_label, route_mode,
    recurrence_label, scheduled_local_time, status, simulation_only
  ) values (
    p_user_id,
    left(trim(p_name), 160),
    p_mission_type,
    left(trim(p_aircraft_label), 160),
    left(trim(p_route_mode), 120),
    left(trim(p_recurrence_label), 120),
    p_scheduled_local_time,
    'ready',
    true
  )
  returning id into v_mission_id;

  insert into public.dominic_hub_events (
    user_id, mission_id, event_type, summary, details
  ) values (
    p_user_id,
    v_mission_id,
    'simulation_schedule_saved',
    'Simulation schedule saved',
    jsonb_build_object(
      'mission_type', p_mission_type,
      'aircraft_label', p_aircraft_label,
      'route_mode', p_route_mode,
      'recurrence_label', p_recurrence_label,
      'scheduled_local_time', p_scheduled_local_time::text
    )
  );

  return v_mission_id;
end;
$function$;

revoke all on function public.save_dominic_hub_simulation_service(uuid,text,text,text,text,text,time) from public, anon;
grant execute on function public.save_dominic_hub_simulation_service(uuid,text,text,text,text,text,time) to authenticated, service_role;
