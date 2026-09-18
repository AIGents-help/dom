-- Pilot-owned businesses may retain mission ownership while assigning field
-- execution to one additional pilot. DOM is the workflow host, not the
-- routine dispatcher or approver for these missions.

alter table public.mission_assignments
  add column if not exists assignment_role text not null default 'field';

alter table public.mission_assignments
  drop constraint if exists mission_assignments_assignment_role_check;
alter table public.mission_assignments
  add constraint mission_assignments_assignment_role_check
  check (assignment_role in ('owner', 'field'));

update public.mission_assignments ma
set assignment_role = 'owner'
from public.jobs j
join public.mission_requests mr on mr.id = j.mission_request_id
where ma.job_id = j.id
  and j.delivery_responsibility = 'pilot'
  and mr.created_by_contractor_id = ma.contractor_id;

drop index if exists public.mission_assignments_one_active_per_job_idx;
create unique index mission_assignments_one_active_field_per_job_idx
  on public.mission_assignments (job_id)
  where assignment_role = 'field'
    and status not in ('declined'::public.assignment_status, 'cancelled'::public.assignment_status);

create unique index if not exists mission_assignments_one_owner_per_job_idx
  on public.mission_assignments (job_id)
  where assignment_role = 'owner';

create or replace function public.pilot_owner_offer_team_assignment(
  p_owner_assignment_id uuid,
  p_actor_user_id uuid,
  p_contractor_id uuid,
  p_payout_cents integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner public.contractors%rowtype;
  v_target public.contractors%rowtype;
  v_owner_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_assignment_id uuid;
begin
  select * into v_owner from public.contractors where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot owner profile not found'; end if;

  select * into v_owner_assignment from public.mission_assignments
  where id = p_owner_assignment_id
    and contractor_id = v_owner.id
    and assignment_role = 'owner'
  for update;
  if not found then raise exception 'Owner mission assignment not found'; end if;
  if v_owner_assignment.status not in ('accepted', 'scheduled', 'in_progress') then
    raise exception 'This mission cannot be staffed in its current state';
  end if;

  select * into v_job from public.jobs where id = v_owner_assignment.job_id for update;
  select * into v_mission from public.mission_requests where id = v_job.mission_request_id for update;
  if v_mission.created_by_contractor_id is distinct from v_owner.id
     or v_job.delivery_responsibility is distinct from 'pilot'
     or coalesce(v_mission.requires_admin_approval, false) then
    raise exception 'Only the owner may staff a pilot-created self-service mission';
  end if;

  select * into v_target from public.contractors where id = p_contractor_id;
  if not found or v_target.id = v_owner.id then raise exception 'Select another pilot'; end if;
  if v_target.status <> 'active' or not v_target.part107_verified or not v_target.insurance_verified then
    raise exception 'The field pilot must be active with verified Part 107 and insurance';
  end if;
  if p_payout_cents is null or p_payout_cents < 0 then
    raise exception 'Enter a valid field-pilot payout';
  end if;
  if v_owner_assignment.mission_price_cents is not null
     and p_payout_cents > v_owner_assignment.mission_price_cents then
    raise exception 'Field-pilot payout cannot exceed the mission price';
  end if;
  if exists (
    select 1 from public.mission_assignments
    where job_id = v_job.id and assignment_role = 'field'
      and status not in ('declined', 'cancelled')
  ) then raise exception 'This mission already has an active field-pilot offer or assignment'; end if;
  if exists (
    select 1 from public.mission_assignments
    where job_id = v_job.id and contractor_id = p_contractor_id
  ) then raise exception 'This pilot has already received this mission'; end if;

  insert into public.mission_assignments (
    job_id, contractor_id, assignment_role, status, offered_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents,
    commission_bps_applied, mission_insurance_verified, insurance_source
  ) values (
    v_job.id, v_target.id, 'field', 'offered', now(),
    v_owner_assignment.mission_price_cents, p_payout_cents, 0,
    0, true, 'pilot_policy'
  ) returning id into v_assignment_id;

  insert into public.mission_checklist_items (
    assignment_id, phase, item_key, label, required, completed, sort_order
  )
  select v_assignment_id, phase, item_key, label, required, false, sort_order
  from public.mission_checklist_items
  where assignment_id = p_owner_assignment_id;

  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_mission.id, v_job.id, v_assignment_id, p_actor_user_id,
    'pilot_owner', 'shared', 'team_pilot_offered',
    'Mission owner offered field execution to another pilot',
    jsonb_build_object('field_pilot_id', v_target.id, 'field_pilot_name', v_target.full_name, 'payout_cents', p_payout_cents)
  );

  return v_assignment_id;
end;
$function$;

create or replace function public.pilot_respond_team_assignment(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_action text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_contractor public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
begin
  select * into v_contractor from public.contractors where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot profile not found'; end if;
  select * into v_assignment from public.mission_assignments
  where id = p_assignment_id and contractor_id = v_contractor.id
    and assignment_role = 'field' for update;
  if not found or v_assignment.status <> 'offered' then raise exception 'Team mission offer not found'; end if;
  if p_action = 'accept' then
    update public.mission_assignments set status='accepted', accepted_at=now() where id=p_assignment_id;
  elsif p_action = 'decline' then
    update public.mission_assignments set status='declined', decline_reason='Declined by invited pilot' where id=p_assignment_id;
  else raise exception 'Invalid response';
  end if;
end;
$function$;

create or replace function public.pilot_return_team_assignment(
  p_assignment_id uuid,
  p_actor_user_id uuid,
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
  select * into v_contractor from public.contractors where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot profile not found'; end if;
  select * into v_assignment from public.mission_assignments
  where id = p_assignment_id and contractor_id = v_contractor.id
    and assignment_role = 'field' for update;
  if not found then raise exception 'Field assignment not found'; end if;
  if v_assignment.status not in ('accepted', 'scheduled') then
    raise exception 'Only an accepted or scheduled field assignment can be returned';
  end if;
  select * into v_job from public.jobs where id = v_assignment.job_id for update;
  if v_job.started_at is not null or v_job.completed_at is not null then
    raise exception 'Contact the mission owner after field work has started';
  end if;
  update public.mission_assignments
  set status = 'cancelled', decline_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
  where id = p_assignment_id;
  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_job.mission_request_id, v_job.id, v_assignment.id, p_actor_user_id,
    'field_pilot', 'shared', 'team_assignment_returned',
    'Field pilot returned the mission to its pilot owner',
    jsonb_build_object('reason', nullif(left(trim(coalesce(p_reason, '')), 500), ''))
  );
end;
$function$;

create or replace function public.pilot_submit_team_mission_for_owner(
  p_assignment_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_pilot public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_incomplete integer;
begin
  select * into v_pilot from public.contractors where user_id=p_actor_user_id;
  select * into v_assignment from public.mission_assignments
  where id=p_assignment_id and contractor_id=v_pilot.id and assignment_role='field' for update;
  if not found then raise exception 'Field assignment not found'; end if;
  if v_assignment.status='submitted' then return; end if;
  if v_assignment.status not in ('accepted','scheduled','in_progress','qc_rejected') then raise exception 'Mission is not ready for submission'; end if;
  select * into v_job from public.jobs where id=v_assignment.job_id for update;
  select * into v_mission from public.mission_requests where id=v_job.mission_request_id for update;
  if v_mission.created_by_contractor_id is null or v_job.delivery_responsibility <> 'pilot' then raise exception 'Mission owner review is unavailable'; end if;
  if v_job.completed_at is null then raise exception 'Mark field capture complete first'; end if;
  if not exists(select 1 from public.deliverables where job_id=v_job.id) then raise exception 'Upload required deliverables first'; end if;
  select count(*) into v_incomplete from public.mission_checklist_items
  where assignment_id=p_assignment_id and required and not completed and item_key<>'mission_submitted';
  if v_incomplete>0 then raise exception 'Complete every required workflow item first'; end if;
  update public.mission_assignments set status='submitted',submitted_at=now() where id=p_assignment_id;
  update public.mission_checklist_items set completed=true,completed_at=now(),notes='Submitted to pilot mission owner'
    where assignment_id=p_assignment_id and item_key='mission_submitted';
  update public.jobs set status='qc' where id=v_job.id;
  update public.mission_requests set status='data_review' where id=v_mission.id;
  insert into public.mission_activity_events (mission_request_id,job_id,assignment_id,actor_user_id,actor_role,visibility,event_type,summary)
  values(v_mission.id,v_job.id,v_assignment.id,p_actor_user_id,'field_pilot','shared','submitted_to_owner','Field pilot submitted the mission to its owner for approval');
end;
$function$;

create or replace function public.pilot_owner_approve_team_mission(
  p_owner_assignment_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner public.contractors%rowtype;
  v_owner_assignment public.mission_assignments%rowtype;
  v_field_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
begin
  select * into v_owner from public.contractors where user_id=p_actor_user_id;
  select * into v_owner_assignment from public.mission_assignments
  where id=p_owner_assignment_id and contractor_id=v_owner.id and assignment_role='owner' for update;
  if not found then raise exception 'Owner mission assignment not found'; end if;
  select * into v_job from public.jobs where id=v_owner_assignment.job_id for update;
  select * into v_mission from public.mission_requests where id=v_job.mission_request_id for update;
  if v_mission.created_by_contractor_id is distinct from v_owner.id or v_job.delivery_responsibility<>'pilot' then raise exception 'Only the mission owner may approve this work'; end if;
  select * into v_field_assignment from public.mission_assignments
  where job_id=v_job.id and assignment_role='field' and status='submitted' for update;
  if not found then raise exception 'The field pilot has not submitted the mission for owner approval'; end if;
  if not exists(select 1 from public.deliverables where job_id=v_job.id) then raise exception 'No deliverables are available for approval'; end if;
  update public.deliverables set qc_passed=true,delivered_at=coalesce(delivered_at,now()) where job_id=v_job.id;
  update public.mission_assignments set status='qc_passed',completed_at=now() where id in (v_owner_assignment.id,v_field_assignment.id);
  update public.mission_checklist_items set completed=true,completed_at=now(),notes='Approved and delivered by the pilot mission owner'
    where assignment_id=v_owner_assignment.id and item_key='mission_submitted';
  update public.jobs set status='delivered',completed_at=coalesce(completed_at,now()) where id=v_job.id;
  update public.mission_requests set status='delivered' where id=v_mission.id;
  update public.contractors set missions_completed=coalesce(missions_completed,0)+1 where id=v_field_assignment.contractor_id;
  insert into public.mission_activity_events (mission_request_id,job_id,assignment_id,actor_user_id,actor_role,visibility,event_type,summary,details)
  values(v_mission.id,v_job.id,v_field_assignment.id,p_actor_user_id,'pilot_owner','shared','owner_approved_team_delivery','Mission owner approved the field pilot work and released deliverables to the client',jsonb_build_object('field_pilot_id',v_field_assignment.contractor_id,'payout_cents',v_field_assignment.contractor_payout_cents));
end;
$function$;

revoke all on function public.pilot_owner_offer_team_assignment(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.pilot_respond_team_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pilot_return_team_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pilot_submit_team_mission_for_owner(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pilot_owner_approve_team_mission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pilot_owner_offer_team_assignment(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.pilot_respond_team_assignment(uuid,uuid,text) to service_role;
grant execute on function public.pilot_return_team_assignment(uuid,uuid,text) to service_role;
grant execute on function public.pilot_submit_team_mission_for_owner(uuid,uuid) to service_role;
grant execute on function public.pilot_owner_approve_team_mission(uuid,uuid) to service_role;
