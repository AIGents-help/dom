alter table contractors add column if not exists user_id uuid unique references auth.users(id);
create unique index if not exists contractors_email_unique_idx on contractors (lower(email));

alter table mission_assignments add column if not exists decline_reason text;

create or replace function enforce_contractor_protected_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' and not is_admin() then
    if new.status is distinct from old.status
      or new.part107_verified is distinct from old.part107_verified
      or new.insurance_verified is distinct from old.insurance_verified
      or new.stripe_connect_account_id is distinct from old.stripe_connect_account_id
      or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
      or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
      or new.rating is distinct from old.rating
      or new.missions_completed is distinct from old.missions_completed
      or new.user_id is distinct from old.user_id
    then
      raise exception 'not permitted to modify protected contractor fields';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_enforce_contractor_protected_fields on contractors;
create trigger trg_enforce_contractor_protected_fields
  before update on contractors
  for each row execute function enforce_contractor_protected_fields();

drop policy if exists "contractor_select_own" on contractors;
create policy "contractor_select_own" on contractors
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "contractor_update_own" on contractors;
create policy "contractor_update_own" on contractors
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "contractor_select_own_assignments" on mission_assignments;
create policy "contractor_select_own_assignments" on mission_assignments
  for select to authenticated using (
    exists (select 1 from contractors c where c.id = mission_assignments.contractor_id and c.user_id = auth.uid())
  );

drop policy if exists "contractor_select_assigned_jobs" on jobs;
create policy "contractor_select_assigned_jobs" on jobs
  for select to authenticated using (
    exists (
      select 1 from mission_assignments ma join contractors c on c.id = ma.contractor_id
      where ma.job_id = jobs.id and c.user_id = auth.uid()
    )
  );

create or replace function accept_mission_assignment(p_assignment_id uuid)
returns void language plpgsql security definer as $$
declare v_ok boolean;
begin
  select exists(
    select 1 from mission_assignments ma join contractors c on c.id = ma.contractor_id
    where ma.id = p_assignment_id and c.user_id = auth.uid() and ma.status = 'offered'
  ) into v_ok;
  if not v_ok then raise exception 'assignment not offerable to this contractor'; end if;
  update mission_assignments set status = 'accepted', accepted_at = now() where id = p_assignment_id;
end; $$;

create or replace function decline_mission_assignment(p_assignment_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_ok boolean;
begin
  select exists(
    select 1 from mission_assignments ma join contractors c on c.id = ma.contractor_id
    where ma.id = p_assignment_id and c.user_id = auth.uid() and ma.status = 'offered'
  ) into v_ok;
  if not v_ok then raise exception 'assignment not offerable to this contractor'; end if;
  update mission_assignments set status = 'declined', decline_reason = p_reason where id = p_assignment_id;
end; $$;

grant execute on function accept_mission_assignment(uuid) to authenticated;
grant execute on function decline_mission_assignment(uuid, text) to authenticated;