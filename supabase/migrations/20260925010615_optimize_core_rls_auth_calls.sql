-- Avoid per-row re-evaluation of auth helpers in high-traffic RLS policies.
-- Wrapping auth helpers in SELECT preserves policy behavior while allowing
-- Postgres to evaluate them once per statement.

drop policy if exists "admins can read own allowlist row" on public.admin_users;
create policy "admins can read own allowlist row"
  on public.admin_users for select
  to authenticated
  using (email = ((select auth.jwt()) ->> 'email'));

drop policy if exists contractor_select_own on public.contractors;
create policy contractor_select_own
  on public.contractors for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists contractor_update_own on public.contractors;
create policy contractor_update_own
  on public.contractors for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists contractor_select_assigned_jobs on public.jobs;
create policy contractor_select_assigned_jobs
  on public.jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = jobs.id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists contractor_select_own_assignments on public.mission_assignments;
create policy contractor_select_own_assignments
  on public.mission_assignments for select
  to authenticated
  using (
    exists (
      select 1
      from public.contractors c
      where c.id = mission_assignments.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "pilots can read own missions" on public.mission_requests;
create policy "pilots can read own missions"
  on public.mission_requests for select
  to authenticated
  using (
    created_by_contractor_id = (
      select c.id
      from public.contractors c
      where c.email = ((select auth.jwt()) ->> 'email')
      limit 1
    )
    or public.is_admin()
  );
