-- Remove the remaining overlapping permissive RLS policy evaluations while
-- preserving the same effective admin/client/pilot access.

-- MISSION ACTIVITY: one read policy for admin, pilot, or client.
drop policy if exists "admins manage mission activity" on public.mission_activity_events;
drop policy if exists "clients read own activity" on public.mission_activity_events;
drop policy if exists "pilots read assigned activity" on public.mission_activity_events;
create policy "authorized users read mission activity"
  on public.mission_activity_events for select
  to authenticated
  using (
    public.is_admin()
    or (
      visibility in ('client','shared')
      and exists (
        select 1
        from public.mission_requests mr
        join public.clients cl on cl.id = mr.client_id
        where mr.id = mission_activity_events.mission_request_id
          and cl.user_id = (select auth.uid())
      )
    )
    or (
      visibility in ('pilot','shared')
      and exists (
        select 1
        from public.mission_assignments ma
        join public.contractors c on c.id = ma.contractor_id
        where ma.id = mission_activity_events.assignment_id
          and c.user_id = (select auth.uid())
      )
    )
  );
create policy "admins insert mission activity"
  on public.mission_activity_events for insert
  to authenticated
  with check (public.is_admin());
create policy "admins update mission activity"
  on public.mission_activity_events for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete mission activity"
  on public.mission_activity_events for delete
  to authenticated
  using (public.is_admin());

-- CAPABILITY REQUIREMENTS: all authenticated users may read; admins write.
drop policy if exists "admins manage requirements" on public.mission_capability_requirements;
drop policy if exists "authenticated read requirements" on public.mission_capability_requirements;
create policy "authenticated read requirements"
  on public.mission_capability_requirements for select
  to authenticated
  using (true);
create policy "admins insert requirements"
  on public.mission_capability_requirements for insert
  to authenticated
  with check (public.is_admin());
create policy "admins update requirements"
  on public.mission_capability_requirements for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete requirements"
  on public.mission_capability_requirements for delete
  to authenticated
  using (public.is_admin());

-- CHANGE ORDERS: one read policy for admin/client; admins write.
drop policy if exists "admins manage change orders" on public.mission_change_orders;
drop policy if exists "clients read own change orders" on public.mission_change_orders;
create policy "authorized users read change orders"
  on public.mission_change_orders for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_requests mr
      join public.clients cl on cl.id = mr.client_id
      where mr.id = mission_change_orders.mission_request_id
        and cl.user_id = (select auth.uid())
    )
  );
create policy "admins insert change orders"
  on public.mission_change_orders for insert
  to authenticated
  with check (public.is_admin());
create policy "admins update change orders"
  on public.mission_change_orders for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete change orders"
  on public.mission_change_orders for delete
  to authenticated
  using (public.is_admin());

-- CHECKLISTS: one ALL policy covers pilot ownership and admin.
drop policy if exists "admins manage checklists" on public.mission_checklist_items;
drop policy if exists "pilots manage assigned checklists" on public.mission_checklist_items;
create policy "pilots manage assigned checklists"
  on public.mission_checklist_items for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_checklist_items.assignment_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_checklist_items.assignment_id
        and c.user_id = (select auth.uid())
    )
  );

-- INCIDENTS: one ALL policy covers pilot ownership and admin.
drop policy if exists "admins manage incidents" on public.mission_incidents;
drop policy if exists "pilots manage assigned incidents" on public.mission_incidents;
create policy "pilots manage assigned incidents"
  on public.mission_incidents for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_incidents.assignment_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_incidents.assignment_id
        and c.user_id = (select auth.uid())
    )
  );

-- READINESS: one read policy for admin/pilot, explicit admin writes.
drop policy if exists "admins manage readiness" on public.mission_readiness_items;
drop policy if exists "pilots read assigned readiness" on public.mission_readiness_items;
create policy "authorized users read readiness"
  on public.mission_readiness_items for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_readiness_items.assignment_id
        and c.user_id = (select auth.uid())
    )
  );
create policy "admins insert readiness"
  on public.mission_readiness_items for insert
  to authenticated
  with check (public.is_admin());
create policy "admins update readiness"
  on public.mission_readiness_items for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete readiness"
  on public.mission_readiness_items for delete
  to authenticated
  using (public.is_admin());

-- PILOT AVAILABILITY: one ALL policy covers owner and admin.
drop policy if exists "admins manage pilot availability" on public.pilot_availability;
drop policy if exists "pilots manage own availability" on public.pilot_availability;
create policy "pilots manage own availability"
  on public.pilot_availability for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = pilot_availability.contractor_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.id = pilot_availability.contractor_id
        and c.user_id = (select auth.uid())
    )
  );
