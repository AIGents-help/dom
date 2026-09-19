
-- Pilots can create mission requests ONLY if they are active, Part 107 verified,
-- and insurance verified. The request starts in 'requested' status and requires
-- admin advancement to proceed.
-- 
-- This also adds a created_by_contractor_id column so admins can see who created each mission.

alter table mission_requests 
  add column if not exists created_by_contractor_id uuid references contractors(id) on delete set null;

alter table mission_requests
  add column if not exists requires_admin_approval boolean not null default false;

-- Index for filtering pilot-created missions
create index if not exists idx_mission_created_by on mission_requests(created_by_contractor_id);

-- RLS policy: authenticated contractors can insert mission requests
-- ONLY if they are active + verified. The row is auto-flagged for admin approval.
drop policy if exists "pilots can create mission requests" on mission_requests;
create policy "pilots can create mission requests"
  on mission_requests for insert
  to authenticated
  with check (
    -- Must be a verified, active contractor
    exists (
      select 1 from contractors
      where contractors.email = auth.jwt() ->> 'email'
        and contractors.status = 'active'
        and contractors.part107_verified = true
        and contractors.insurance_verified = true
    )
    -- And the mission must start in 'requested' status with admin approval flag
    and status = 'requested'
    and requires_admin_approval = true
  );

-- Pilots can read only their own created missions
drop policy if exists "pilots can read own missions" on mission_requests;
create policy "pilots can read own missions"
  on mission_requests for select
  to authenticated
  using (
    created_by_contractor_id = (
      select id from contractors where email = auth.jwt() ->> 'email' limit 1
    )
    or is_admin()
  );
