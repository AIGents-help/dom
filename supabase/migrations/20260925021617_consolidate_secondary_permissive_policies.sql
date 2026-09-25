-- Consolidate additional overlapping permissive policies while preserving
-- the same admin and pilot capabilities.

-- CONTRACTOR PORTFOLIO
drop policy if exists "admins full access" on public.contractor_portfolio_images;
drop policy if exists "contractor manages own portfolio" on public.contractor_portfolio_images;
create policy "contractor manages own portfolio"
  on public.contractor_portfolio_images for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = contractor_portfolio_images.contractor_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = contractor_portfolio_images.contractor_id
        and c.user_id = (select auth.uid())
    )
  );

-- MAPPING TABLES whose existing owner policy already carries admin access.
drop policy if exists "admins full access" on public.mapping_gcps;
drop policy if exists "admins full access" on public.mapping_measurements;

-- MAPPING EVENTS: contractor SELECT + explicit admin writes.
drop policy if exists "admins full access" on public.mapping_events;
drop policy if exists "admins insert mapping events" on public.mapping_events;
create policy "admins insert mapping events"
  on public.mapping_events for insert
  to authenticated
  with check (public.is_admin());
drop policy if exists "admins update mapping events" on public.mapping_events;
create policy "admins update mapping events"
  on public.mapping_events for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete mapping events" on public.mapping_events;
create policy "admins delete mapping events"
  on public.mapping_events for delete
  to authenticated
  using (public.is_admin());

-- MAPPING PROCESSING JOBS: contractor SELECT + explicit admin writes.
drop policy if exists "admins full access" on public.mapping_processing_jobs;
drop policy if exists "admins insert mapping processing jobs" on public.mapping_processing_jobs;
create policy "admins insert mapping processing jobs"
  on public.mapping_processing_jobs for insert
  to authenticated
  with check (public.is_admin());
drop policy if exists "admins update mapping processing jobs" on public.mapping_processing_jobs;
create policy "admins update mapping processing jobs"
  on public.mapping_processing_jobs for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete mapping processing jobs" on public.mapping_processing_jobs;
create policy "admins delete mapping processing jobs"
  on public.mapping_processing_jobs for delete
  to authenticated
  using (public.is_admin());

-- MISSION CONTACTS: pilot SELECT + explicit admin writes.
drop policy if exists "admins full access" on public.mission_contacts;
drop policy if exists "admins insert mission contacts" on public.mission_contacts;
create policy "admins insert mission contacts"
  on public.mission_contacts for insert
  to authenticated
  with check (public.is_admin());
drop policy if exists "admins update mission contacts" on public.mission_contacts;
create policy "admins update mission contacts"
  on public.mission_contacts for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete mission contacts" on public.mission_contacts;
create policy "admins delete mission contacts"
  on public.mission_contacts for delete
  to authenticated
  using (public.is_admin());

-- Mission expenses already have an ALL policy with public.is_admin().
drop policy if exists "admins full access" on public.mission_expenses;

-- Mission permissions: pilot SELECT + explicit admin writes.
drop policy if exists "admins full access" on public.mission_permissions;
drop policy if exists "admins insert mission permissions" on public.mission_permissions;
create policy "admins insert mission permissions"
  on public.mission_permissions for insert
  to authenticated
  with check (public.is_admin());
drop policy if exists "admins update mission permissions" on public.mission_permissions;
create policy "admins update mission permissions"
  on public.mission_permissions for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete mission permissions" on public.mission_permissions;
create policy "admins delete mission permissions"
  on public.mission_permissions for delete
  to authenticated
  using (public.is_admin());
