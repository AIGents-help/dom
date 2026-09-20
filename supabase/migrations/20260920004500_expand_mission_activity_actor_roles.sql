-- Team missions introduced more specific pilot actor roles after the original
-- mission-control event table was created. Keep the audit constraint aligned
-- with the workflow functions that write those events.
alter table public.mission_activity_events
  drop constraint if exists mission_activity_events_actor_role_check;

alter table public.mission_activity_events
  add constraint mission_activity_events_actor_role_check
  check (actor_role in ('admin','pilot','pilot_owner','field_pilot','client','system'));
