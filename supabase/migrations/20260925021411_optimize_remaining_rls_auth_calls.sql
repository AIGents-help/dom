-- Optimize the remaining RLS policies flagged by Supabase for per-row
-- auth helper evaluation. Behavior is unchanged; auth.uid()/auth.jwt() are
-- wrapped in SELECT so Postgres can evaluate them once per statement.

drop policy if exists "pilots read assigned mission contacts" on public.mission_contacts;
create policy "pilots read assigned mission contacts"
  on public.mission_contacts for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_contacts.mission_request_id
        and c.email = ((select auth.jwt()) ->> 'email')
    )
    or public.is_admin()
  );

drop policy if exists "pilots manage own expenses" on public.mission_expenses;
create policy "pilots manage own expenses"
  on public.mission_expenses for all
  to authenticated
  using (
    exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_expenses.mission_request_id
        and c.email = ((select auth.jwt()) ->> 'email')
    )
    or public.is_admin()
  )
  with check (
    exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_expenses.mission_request_id
        and c.email = ((select auth.jwt()) ->> 'email')
    )
    or public.is_admin()
  );

drop policy if exists "pilots read assigned permissions" on public.mission_permissions;
create policy "pilots read assigned permissions"
  on public.mission_permissions for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_permissions.mission_request_id
        and c.email = ((select auth.jwt()) ->> 'email')
    )
    or public.is_admin()
  );

drop policy if exists "contractor manages own portfolio" on public.contractor_portfolio_images;
create policy "contractor manages own portfolio"
  on public.contractor_portfolio_images for all
  to authenticated
  using (
    exists (
      select 1 from public.contractors c
      where c.id = contractor_portfolio_images.contractor_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.contractors c
      where c.id = contractor_portfolio_images.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "pilot manages assigned mission docs" on public.mission_documents;
create policy "pilot manages assigned mission docs"
  on public.mission_documents for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.jobs j on j.id = ma.job_id
      join public.contractors c on c.id = ma.contractor_id
      where j.mission_request_id = mission_documents.mission_request_id
        and c.user_id = (select auth.uid())
        and ma.status = 'accepted'::public.assignment_status
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.jobs j on j.id = ma.job_id
      join public.contractors c on c.id = ma.contractor_id
      where j.mission_request_id = mission_documents.mission_request_id
        and c.user_id = (select auth.uid())
        and ma.status = 'accepted'::public.assignment_status
    )
  );

drop policy if exists "pilot manages own job deliverables" on public.deliverables;
create policy "pilot manages own job deliverables"
  on public.deliverables for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = deliverables.job_id
        and c.user_id = (select auth.uid())
        and ma.status = 'accepted'::public.assignment_status
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.job_id = deliverables.job_id
        and c.user_id = (select auth.uid())
        and ma.status = 'accepted'::public.assignment_status
    )
  );

drop policy if exists "contractor manages own mapping projects" on public.mapping_projects;
create policy "contractor manages own mapping projects"
  on public.mapping_projects for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = mapping_projects.contractor_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = mapping_projects.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own project images" on public.mapping_images;
create policy "contractor manages own project images"
  on public.mapping_images for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_images.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_images.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor reads own project processing jobs" on public.mapping_processing_jobs;
create policy "contractor reads own project processing jobs"
  on public.mapping_processing_jobs for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_processing_jobs.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own project gcps" on public.mapping_gcps;
create policy "contractor manages own project gcps"
  on public.mapping_gcps for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_gcps.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_gcps.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own project measurements" on public.mapping_measurements;
create policy "contractor manages own project measurements"
  on public.mapping_measurements for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_measurements.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_measurements.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor reads own project events" on public.mapping_events;
create policy "contractor reads own project events"
  on public.mapping_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mapping_projects mp
      join public.contractors c on c.id = mp.contractor_id
      where mp.id = mapping_events.mapping_project_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own assets" on public.pilot_assets;
create policy "contractor manages own assets"
  on public.pilot_assets for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = pilot_assets.contractor_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = pilot_assets.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own asset capabilities" on public.pilot_asset_capabilities;
create policy "contractor manages own asset capabilities"
  on public.pilot_asset_capabilities for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.pilot_assets pa
      join public.contractors c on c.id = pa.contractor_id
      where pa.id = pilot_asset_capabilities.asset_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.pilot_assets pa
      join public.contractors c on c.id = pa.contractor_id
      where pa.id = pilot_asset_capabilities.asset_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "contractor manages own mission asset assignments" on public.mission_asset_assignments;
create policy "contractor manages own mission asset assignments"
  on public.mission_asset_assignments for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_asset_assignments.mission_assignment_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_asset_assignments.mission_assignment_id
        and c.user_id = (select auth.uid())
    )
  );
