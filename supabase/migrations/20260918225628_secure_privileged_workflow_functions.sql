-- Move sensitive workflow mutations behind authenticated application routes.
-- Existing browser-callable functions are retained for migration compatibility,
-- but no longer exposed through the Data API.

create or replace function public.pilot_respond_dom_assignment(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_contractor public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_contractor
  from public.contractors
  where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot profile not found'; end if;

  select * into v_assignment
  from public.mission_assignments
  where id = p_assignment_id
    and contractor_id = v_contractor.id
    and assignment_role = 'field'
  for update;
  if not found or v_assignment.status <> 'offered' then
    raise exception 'Mission offer not found';
  end if;
  select * into v_job from public.jobs where id = v_assignment.job_id;
  if v_job.delivery_responsibility = 'pilot' then
    raise exception 'Pilot-owned team offers use the owner-review workflow';
  end if;

  if p_action = 'accept' then
    update public.mission_assignments
    set status = 'accepted', accepted_at = now()
    where id = p_assignment_id;
  elsif p_action = 'decline' then
    update public.mission_assignments
    set status = 'declined', decline_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
    where id = p_assignment_id;
  else
    raise exception 'Invalid response';
  end if;
end;
$function$;

revoke all on function public.pilot_respond_dom_assignment(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pilot_respond_dom_assignment(uuid,uuid,text,text) to service_role;

-- Retire old direct-browser mutation entry points.
alter function public.accept_mission_assignment(uuid) set search_path = 'public', 'pg_temp';
alter function public.decline_mission_assignment(uuid,text) set search_path = 'public', 'pg_temp';
alter function public.admin_approve_self_service(uuid) set search_path = 'public', 'pg_temp';
alter function public.admin_release_mission_claim(uuid) set search_path = 'public', 'pg_temp';
revoke all on function public.accept_mission_assignment(uuid) from public,anon,authenticated;
revoke all on function public.decline_mission_assignment(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_approve_self_service(uuid) from public,anon,authenticated;
revoke all on function public.admin_release_mission_claim(uuid) from public,anon,authenticated;

-- Limit remaining privileged functions to their actual callers and pin their
-- lookup path so untrusted objects cannot shadow referenced relations.
alter function public.pilot_create_own_mission(text,text,text,text,numeric,numeric,text,text,jsonb,text)
  set search_path = 'public', 'pg_temp';
revoke all on function public.pilot_create_own_mission(text,text,text,text,numeric,numeric,text,text,jsonb,text) from public,anon;
grant execute on function public.pilot_create_own_mission(text,text,text,text,numeric,numeric,text,text,jsonb,text) to authenticated,service_role;

alter function public.calculate_commission_bps(uuid,integer) set search_path = 'public', 'pg_temp';
revoke all on function public.calculate_commission_bps(uuid,integer) from public,anon,authenticated;
grant execute on function public.calculate_commission_bps(uuid,integer) to service_role;

revoke all on function public.claim_mapping_processing_job(text) from public,anon,authenticated;
grant execute on function public.claim_mapping_processing_job(text) to service_role;

revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated,service_role;

-- New functions must be explicitly granted instead of inheriting public
-- execution. This applies to future functions created by the migration owner.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon,authenticated;
