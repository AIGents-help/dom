-- Add covering indexes for high-traffic mission foreign keys identified by
-- the Supabase performance advisor. Existing composite indexes are preserved.

create index if not exists mission_activity_events_job_id_idx
  on public.mission_activity_events(job_id);
create index if not exists mission_activity_events_assignment_id_idx
  on public.mission_activity_events(assignment_id);
create index if not exists mission_activity_events_actor_user_id_idx
  on public.mission_activity_events(actor_user_id);

create index if not exists mission_requests_client_id_idx
  on public.mission_requests(client_id);
create index if not exists mission_requests_requested_contractor_id_idx
  on public.mission_requests(requested_contractor_id);
create index if not exists mission_requests_claimed_by_contractor_id_idx
  on public.mission_requests(claimed_by_contractor_id);

create index if not exists mission_readiness_items_assignment_id_idx
  on public.mission_readiness_items(assignment_id);
create index if not exists mission_readiness_items_completed_by_idx
  on public.mission_readiness_items(completed_by);

create index if not exists mission_change_orders_quote_id_idx
  on public.mission_change_orders(quote_id);
create index if not exists mission_change_orders_requested_by_idx
  on public.mission_change_orders(requested_by);
create index if not exists mission_change_orders_responded_by_idx
  on public.mission_change_orders(responded_by);

create index if not exists mission_cost_entries_assignment_id_idx
  on public.mission_cost_entries(assignment_id);
create index if not exists mission_cost_entries_created_by_idx
  on public.mission_cost_entries(created_by);

create index if not exists mission_incidents_reported_by_idx
  on public.mission_incidents(reported_by);
