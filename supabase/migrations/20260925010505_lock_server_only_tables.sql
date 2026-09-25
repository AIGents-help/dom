-- These tables are intentionally accessed only through server-side routes
-- using the service role. Remove broad client-role table grants so they are
-- not directly reachable through the Data API even if an RLS policy is added
-- incorrectly later.

revoke all on table public.pilot_mission_drafts from anon, authenticated;
grant all on table public.pilot_mission_drafts to service_role;

revoke all on table public.smartlead_webhook_events from anon, authenticated;
grant all on table public.smartlead_webhook_events to service_role;
