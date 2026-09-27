drop policy if exists "Users manage own DOMINIC HUB missions" on public.dominic_hub_missions;
create policy "Organization users manage own DOMINIC HUB missions"
  on public.dominic_hub_missions
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.dominic_profiles dp
      where dp.user_id = (select auth.uid())
        and dp.status = 'active'
        and dp.plan = 'organization'
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.dominic_profiles dp
      where dp.user_id = (select auth.uid())
        and dp.status = 'active'
        and dp.plan = 'organization'
    )
  );

drop policy if exists "Users read own DOMINIC HUB events" on public.dominic_hub_events;
create policy "Organization users read own DOMINIC HUB events"
  on public.dominic_hub_events
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.dominic_profiles dp
      where dp.user_id = (select auth.uid())
        and dp.status = 'active'
        and dp.plan = 'organization'
    )
  );

drop policy if exists "Users create own DOMINIC HUB events" on public.dominic_hub_events;
create policy "Organization users create own DOMINIC HUB events"
  on public.dominic_hub_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.dominic_profiles dp
      where dp.user_id = (select auth.uid())
        and dp.status = 'active'
        and dp.plan = 'organization'
    )
  );