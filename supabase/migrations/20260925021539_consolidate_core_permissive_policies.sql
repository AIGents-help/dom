-- Consolidate overlapping permissive policies on the highest-traffic DOM
-- tables. This preserves admin access while avoiding duplicate policy checks.

-- CONTRACTORS
drop policy if exists "admins full access" on public.contractors;
drop policy if exists contractor_select_own on public.contractors;
create policy contractor_select_own
  on public.contractors for select
  to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));

drop policy if exists contractor_update_own on public.contractors;
create policy contractor_update_own
  on public.contractors for update
  to authenticated
  using (public.is_admin() or user_id = (select auth.uid()))
  with check (public.is_admin() or user_id = (select auth.uid()));

drop policy if exists "admins insert contractors" on public.contractors;
create policy "admins insert contractors"
  on public.contractors for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete contractors" on public.contractors;
create policy "admins delete contractors"
  on public.contractors for delete
  to authenticated
  using (public.is_admin());

-- JOBS
drop policy if exists "admins full access" on public.jobs;
drop policy if exists contractor_select_assigned_jobs on public.jobs;
create policy contractor_select_assigned_jobs
  on public.jobs for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = jobs.id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "admins insert jobs" on public.jobs;
create policy "admins insert jobs"
  on public.jobs for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update jobs" on public.jobs;
create policy "admins update jobs"
  on public.jobs for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete jobs" on public.jobs;
create policy "admins delete jobs"
  on public.jobs for delete
  to authenticated
  using (public.is_admin());

-- MISSION ASSIGNMENTS
drop policy if exists "admins full access" on public.mission_assignments;
drop policy if exists contractor_select_own_assignments on public.mission_assignments;
create policy contractor_select_own_assignments
  on public.mission_assignments for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.contractors c
      where c.id = mission_assignments.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "admins insert mission assignments" on public.mission_assignments;
create policy "admins insert mission assignments"
  on public.mission_assignments for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update mission assignments" on public.mission_assignments;
create policy "admins update mission assignments"
  on public.mission_assignments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete mission assignments" on public.mission_assignments;
create policy "admins delete mission assignments"
  on public.mission_assignments for delete
  to authenticated
  using (public.is_admin());

-- MISSION REQUESTS
drop policy if exists "admins full access" on public.mission_requests;
drop policy if exists "pilots can read own missions" on public.mission_requests;
create policy "pilots can read own missions"
  on public.mission_requests for select
  to authenticated
  using (
    public.is_admin()
    or created_by_contractor_id = (
      select c.id
      from public.contractors c
      where c.email = ((select auth.jwt()) ->> 'email')
      limit 1
    )
  );

drop policy if exists "admins insert mission requests" on public.mission_requests;
create policy "admins insert mission requests"
  on public.mission_requests for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update mission requests" on public.mission_requests;
create policy "admins update mission requests"
  on public.mission_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete mission requests" on public.mission_requests;
create policy "admins delete mission requests"
  on public.mission_requests for delete
  to authenticated
  using (public.is_admin());

-- These existing ALL policies already include public.is_admin(), so the
-- duplicate admin-wide policy is unnecessary.
drop policy if exists "admins full access" on public.deliverables;
drop policy if exists "admins full access" on public.mission_documents;
drop policy if exists "admins full access" on public.mapping_projects;
drop policy if exists "admins full access" on public.mapping_images;
drop policy if exists "admins full access" on public.pilot_assets;
drop policy if exists "admins full access" on public.pilot_asset_capabilities;
drop policy if exists "admins full access" on public.mission_asset_assignments;
