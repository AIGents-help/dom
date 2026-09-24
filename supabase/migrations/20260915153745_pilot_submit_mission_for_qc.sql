-- Submit the pilot's completed field workflow to DOM QC as one transaction.
create or replace function public.pilot_submit_mission_for_qc(p_assignment_id uuid, p_actor_user_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_incomplete integer;
begin
  select * into v_assignment from public.mission_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Mission assignment not found'; end if;
  if v_assignment.status in ('submitted', 'qc_passed', 'paid') then return; end if;
  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress', 'qc_rejected') then raise exception 'Mission is not in a submittable state'; end if;
  select * into v_job from public.jobs where id = v_assignment.job_id for update;
  if v_job.completed_at is null then raise exception 'Mark field capture complete before submitting'; end if;
  if not exists (select 1 from public.deliverables where job_id = v_job.id) then raise exception 'Upload at least one deliverable before submitting'; end if;
  select count(*) into v_incomplete from public.mission_checklist_items
    where assignment_id = p_assignment_id and required and not completed and item_key <> 'mission_submitted';
  if v_incomplete > 0 then raise exception 'Complete all required workflow items before submitting'; end if;

  update public.mission_assignments set status = 'submitted', submitted_at = now() where id = p_assignment_id;
  update public.jobs set status = 'qc' where id = v_job.id;
  update public.mission_requests set status = 'data_review' where id = v_job.mission_request_id;
  update public.mission_checklist_items set completed = true, completed_at = now()
    where assignment_id = p_assignment_id and item_key = 'mission_submitted';
  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id, actor_role, visibility, event_type, summary
  ) values (
    v_job.mission_request_id, v_job.id, p_assignment_id, p_actor_user_id,
    'pilot', 'shared', 'mission_submitted', 'Pilot submitted mission deliverables for DOM QC'
  );
end;
$$;

revoke all on function public.pilot_submit_mission_for_qc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pilot_submit_mission_for_qc(uuid, uuid) to service_role;

-- Complete QC consistently across assignment, job, and mission records.
create or replace function public.admin_mark_mission_complete(p_assignment_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_assignment from public.mission_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Mission assignment not found'; end if;
  if v_assignment.status in ('qc_passed', 'paid') then return; end if;
  if v_assignment.status <> 'submitted' then raise exception 'Pilot must submit the mission for QC first'; end if;

  select * into v_job from public.jobs where id = v_assignment.job_id for update;
  if not exists (select 1 from public.deliverables where job_id = v_job.id) then
    raise exception 'At least one deliverable is required';
  end if;
  if exists (select 1 from public.deliverables where job_id = v_job.id and not coalesce(qc_passed, false)) then
    raise exception 'Every deliverable must pass QC';
  end if;

  update public.mission_assignments set status = 'qc_passed', completed_at = now() where id = p_assignment_id;
  update public.jobs set status = 'delivered', completed_at = coalesce(completed_at, now()) where id = v_job.id;
  update public.mission_requests set status = 'delivered' where id = v_job.mission_request_id;
  update public.contractors set missions_completed = missions_completed + 1 where id = v_assignment.contractor_id;
  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_role, visibility, event_type, summary
  ) values (
    v_job.mission_request_id, v_job.id, p_assignment_id,
    'admin', 'shared', 'qc_passed', 'DOM approved the mission deliverables'
  );
end;
$$;

revoke all on function public.admin_mark_mission_complete(uuid) from public, anon, authenticated;
grant execute on function public.admin_mark_mission_complete(uuid) to service_role;