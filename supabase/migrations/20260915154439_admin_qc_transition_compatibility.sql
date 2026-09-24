create or replace function public.admin_mark_mission_complete(p_assignment_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_assignment from public.mission_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Mission assignment not found'; end if;
  if v_assignment.status in ('qc_passed', 'paid') then return; end if;
  if v_assignment.status not in ('accepted', 'submitted') then raise exception 'Pilot must submit the mission for QC first'; end if;

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