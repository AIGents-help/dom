-- Kept separate from the enum migration because PostgreSQL requires the new
-- enum value to be committed before DML can reference it.
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

    update public.mission_assignments
       set status = 'scheduled'
     where job_id = new.id
       and status::text = 'accepted';
  end if;
  return new;
end;
$$;

update public.mission_assignments ma
   set status = 'scheduled'
  from public.jobs j
 where j.id = ma.job_id
   and j.scheduled_for is not null
   and ma.status::text = 'accepted';
