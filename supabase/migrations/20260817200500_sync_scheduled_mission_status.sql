-- This is intentionally separate from the enum migration: PostgreSQL requires
-- a commit before a newly-added enum value can be referenced by DML.
create or replace function public.sync_mission_status_from_job_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scheduled_for is not null
     and new.scheduled_for is distinct from old.scheduled_for then
    update public.mission_requests
       set status = 'scheduled'
     where id = new.mission_request_id
       and status::text in ('approved', 'claimed', 'assigned');
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_sync_scheduled_mission_status on public.jobs;
create trigger jobs_sync_scheduled_mission_status
after update of scheduled_for on public.jobs
for each row
execute function public.sync_mission_status_from_job_schedule();

-- Bring currently dated missions into the same lifecycle without changing
-- work already in progress or completed.
update public.mission_requests mr
   set status = 'scheduled'
  from public.jobs j
 where j.mission_request_id = mr.id
   and j.scheduled_for is not null
   and mr.status::text in ('approved', 'claimed', 'assigned');
