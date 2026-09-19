
create or replace function public.calculate_commission_bps(p_contractor_id uuid, p_mission_value_cents integer)
returns integer
language plpgsql
security definer
as $function$
declare
  v_subscription_active boolean;
  v_completed_count integer;
  v_pilot_tier_bps integer;
  v_risk_floor_bps integer;
  v_effective_bps integer;
begin
  select subscription_active into v_subscription_active from contractors where id = p_contractor_id;
  if not found then
    raise exception 'contractor not found for commission calculation: %', p_contractor_id;
  end if;
  if v_subscription_active then
    return 0;
  end if;

  select count(*) into v_completed_count
    from mission_assignments
    where contractor_id = p_contractor_id
      and status in ('qc_passed', 'paid')
      and completed_at is not null
      and completed_at >= now() - interval '90 days';

  v_pilot_tier_bps := case
    when v_completed_count >= 10 then 1000
    when v_completed_count >= 5 then 1500
    else 2000
  end;

  v_risk_floor_bps := case when p_mission_value_cents >= 50000 then 1500 else 0 end;

  v_effective_bps := greatest(v_pilot_tier_bps, v_risk_floor_bps);
  v_effective_bps := greatest(v_effective_bps, 500);

  return v_effective_bps;
end;
$function$;
