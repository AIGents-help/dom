alter table contractors
  add column if not exists can_create_missions boolean not null default false,
  add column if not exists subscription_active boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table mission_assignments
  add column if not exists completed_at timestamptz;

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
      or new.can_create_missions is distinct from old.can_create_missions
      or new.subscription_active is distinct from old.subscription_active
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    then
      raise exception 'not permitted to modify protected contractor fields';
    end if;
  end if;
  return new;
end; $$;

create or replace function public.admin_mark_mission_complete(p_assignment_id uuid)
returns void language plpgsql as $$
declare v_contractor_id uuid;
begin
  update mission_assignments set status = 'qc_passed', completed_at = now()
    where id = p_assignment_id and status = 'accepted'
    returning contractor_id into v_contractor_id;
  if v_contractor_id is null then
    raise exception 'assignment not found or not in accepted status';
  end if;
  update contractors set missions_completed = missions_completed + 1 where id = v_contractor_id;
end; $$;

create or replace function public.admin_approve_self_service(p_contractor_id uuid)
returns void language plpgsql as $$
declare v_count int;
begin
  select missions_completed into v_count from contractors where id = p_contractor_id;
  if v_count is null then raise exception 'contractor not found'; end if;
  if v_count < 1 then raise exception 'contractor has not completed a mission yet'; end if;
  update contractors set can_create_missions = true where id = p_contractor_id;
end; $$;