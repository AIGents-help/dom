-- Prevent pilot-owner delivery from re-releasing a client-rejected revision.
-- A revision_requested predecessor must have an active corrected child before
-- owner certification. Only current leaf deliverables are QC-released.
create or replace function public.pilot_owner_certify_mission(
  p_assignment_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_incomplete integer;
begin
  select * into v_owner from public.contractors where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot profile not found'; end if;

  select * into v_assignment from public.mission_assignments
  where id = p_assignment_id and contractor_id = v_owner.id for update;
  if not found then raise exception 'Mission assignment not found'; end if;
  if v_assignment.status in ('qc_passed', 'paid') then return; end if;
  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress', 'qc_rejected') then
    raise exception 'Mission is not in a completable state';
  end if;

  select * into v_job from public.jobs where id = v_assignment.job_id for update;
  select * into v_mission from public.mission_requests where id = v_job.mission_request_id for update;
  if v_mission.created_by_contractor_id is distinct from v_owner.id
     or v_job.delivery_responsibility is distinct from 'pilot'
     or coalesce(v_mission.requires_admin_approval, false) then
    raise exception 'Only the owner can approve a pilot-created self-service mission';
  end if;
  if v_job.completed_at is null then raise exception 'Mark field capture complete before delivery'; end if;

  if not exists (
    select 1 from public.deliverables
    where job_id = v_job.id and coalesce(client_status, '') <> 'superseded'
  ) then raise exception 'Upload the required deliverables before delivery'; end if;

  if exists (
    select 1
    from public.deliverables prior
    where prior.job_id = v_job.id
      and prior.client_status = 'revision_requested'
      and not exists (
        select 1
        from public.deliverables current
        where current.job_id = v_job.id
          and current.supersedes_deliverable_id = prior.id
          and coalesce(current.client_status, '') <> 'superseded'
      )
  ) then
    raise exception 'Resolve every client revision request with a corrected deliverable before delivery';
  end if;

  select count(*) into v_incomplete
  from public.mission_checklist_items
  where assignment_id = p_assignment_id
    and required and not completed and item_key <> 'mission_submitted';
  if v_incomplete > 0 then raise exception 'Complete every required workflow item before delivery'; end if;

  -- Release only active leaves. A revision_requested predecessor is history
  -- waiting to be superseded, not a deliverable that should be re-QC'd.
  update public.deliverables current
  set qc_passed = true,
      delivered_at = coalesce(current.delivered_at, now())
  where current.job_id = v_job.id
    and coalesce(current.client_status, '') not in ('superseded', 'revision_requested')
    and not exists (
      select 1 from public.deliverables child
      where child.job_id = v_job.id
        and child.supersedes_deliverable_id = current.id
        and coalesce(child.client_status, '') <> 'superseded'
    );

  update public.deliverables prior
  set client_status = 'superseded'
  where prior.job_id = v_job.id
    and prior.client_status = 'revision_requested'
    and exists (
      select 1 from public.deliverables current
      where current.job_id = v_job.id
        and current.supersedes_deliverable_id = prior.id
        and coalesce(current.client_status, '') <> 'superseded'
        and current.qc_passed = true
    );

  update public.mission_assignments
  set status = 'qc_passed', submitted_at = coalesce(submitted_at, now()), completed_at = now()
  where id = p_assignment_id;
  update public.jobs set status = 'delivered', completed_at = coalesce(completed_at, now()) where id = v_job.id;
  update public.mission_requests set status = 'delivered' where id = v_mission.id;
  update public.mission_checklist_items
  set completed = true, completed_at = now(), notes = 'Certified and delivered by the pilot mission owner'
  where assignment_id = p_assignment_id and item_key = 'mission_submitted';
  update public.contractors set missions_completed = missions_completed + 1 where id = v_assignment.contractor_id;

  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_mission.id, v_job.id, v_assignment.id, p_actor_user_id,
    'pilot', 'shared', 'owner_approved_and_delivered',
    'Mission owner certified the current deliverable package and released it to the client',
    jsonb_build_object('approval_authority','pilot_mission_owner','dom_qc_required',false,'revision_aware_delivery',true)
  );
end;
$function$;

revoke all on function public.pilot_owner_certify_mission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pilot_owner_certify_mission(uuid, uuid) to service_role;
