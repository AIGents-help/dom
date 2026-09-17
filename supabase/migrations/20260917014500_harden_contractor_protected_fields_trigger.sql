create or replace function public.enforce_contractor_protected_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
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
      or new.cert_timeline_bucket is distinct from old.cert_timeline_bucket
      or new.part107_test_date is distinct from old.part107_test_date
      or new.membership_deadline is distinct from old.membership_deadline
      or new.final_notice_sent_at is distinct from old.final_notice_sent_at
      or new.resource_access_locked is distinct from old.resource_access_locked
      or new.resource_access_active is distinct from old.resource_access_active
      or new.resource_access_subscription_id is distinct from old.resource_access_subscription_id
    then
      raise exception 'not permitted to modify protected contractor fields';
    end if;
  end if;
  return new;
end;
$function$;
