
create or replace function public.admin_offer_mission(p_mission_request_id uuid, p_contractor_id uuid, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
returns uuid
language plpgsql
as $function$
declare
  v_mr record;
  v_contractor record;
  v_client_id uuid;
  v_job_id uuid;
  v_commission_bps integer;
  v_commission_cents integer;
  v_contractor_cents integer;
begin
  select * into v_mr from mission_requests where id = p_mission_request_id;
  if not found then raise exception 'mission_request not found'; end if;

  select status, part107_verified, insurance_verified into v_contractor
    from contractors where id = p_contractor_id;
  if not found then raise exception 'contractor not found'; end if;
  if v_contractor.status <> 'active' or not v_contractor.part107_verified or not v_contractor.insurance_verified then
    raise exception 'contractor is not active and fully verified (Part 107 + insurance) — cannot offer a mission';
  end if;

  select id into v_client_id from clients where lower(email) = lower(v_mr.requester_email);
  if v_client_id is null then
    insert into clients (contact_name, company_name, email)
      values (v_mr.requester_name, coalesce(v_mr.company, v_mr.requester_name), v_mr.requester_email)
      returning id into v_client_id;
  end if;

  insert into jobs (mission_request_id, client_id, title, service_type, location, scheduled_for, status)
    values (
      p_mission_request_id, v_client_id,
      coalesce(v_mr.company, v_mr.requester_name) || ' — ' || v_mr.service_type,
      v_mr.service_type, v_mr.location, p_scheduled_for, 'scheduled'
    )
    returning id into v_job_id;

  v_commission_bps := calculate_commission_bps(p_contractor_id, v_mr.quoted_amount_cents);
  v_commission_cents := round(v_mr.quoted_amount_cents::numeric * v_commission_bps / 10000);
  v_contractor_cents := v_mr.quoted_amount_cents - v_commission_cents;

  insert into mission_assignments (
    job_id, contractor_id, status, offered_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents, commission_bps_applied
  ) values (
    v_job_id, p_contractor_id, 'offered', now(),
    v_mr.quoted_amount_cents, v_contractor_cents, v_commission_cents, v_commission_bps
  );

  update mission_requests set status = 'assigned', claimed_by_contractor_id = null where id = p_mission_request_id;
  return v_job_id;
end;
$function$;

create or replace function public.pilot_create_own_mission(p_client_name text, p_client_email text, p_client_company text, p_location text, p_latitude numeric, p_longitude numeric, p_service_type text, p_airspace_class text, p_quote jsonb, p_scope text DEFAULT NULL::text)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_contractor record;
  v_client_id uuid;
  v_mr_id uuid;
  v_job_id uuid;
  v_total_cents integer;
  v_commission_bps integer;
  v_commission_cents integer;
  v_contractor_cents integer;
begin
  select id, can_create_missions into v_contractor from contractors where user_id = auth.uid();
  if not found or not v_contractor.can_create_missions then
    raise exception 'not approved for self-service mission creation';
  end if;

  select id into v_client_id from clients where lower(email) = lower(p_client_email);
  if v_client_id is null then
    insert into clients (contact_name, company_name, email)
      values (p_client_name, coalesce(p_client_company, p_client_name), p_client_email)
      returning id into v_client_id;
  end if;

  v_total_cents := (p_quote->>'totalCents')::int;

  insert into mission_requests (
    requester_name, requester_email, company, service_type, location,
    latitude, longitude, airspace_class, status, quoted_amount_cents, client_id, scope,
    created_by_contractor_id, requires_admin_approval
  ) values (
    p_client_name, p_client_email, p_client_company, p_service_type, p_location,
    p_latitude, p_longitude, p_airspace_class, 'assigned', v_total_cents, v_client_id, p_scope,
    v_contractor.id, false
  ) returning id into v_mr_id;

  v_commission_bps := calculate_commission_bps(v_contractor.id, v_total_cents);
  v_commission_cents := round(v_total_cents::numeric * v_commission_bps / 10000);
  v_contractor_cents := v_total_cents - v_commission_cents;

  insert into quotes (
    mission_request_id, service_type, base_price_cents, location_mod, airspace_mod,
    complexity_mod, urgency_mod, deliverable_mod, combined_multiplier, total_cents,
    commission_cents, contractor_cents, warnings
  ) values (
    v_mr_id, p_service_type, (p_quote->>'basePriceCents')::int,
    (p_quote->>'locationMod')::numeric, (p_quote->>'airspaceMod')::numeric,
    (p_quote->>'complexityMod')::numeric, (p_quote->>'urgencyMod')::numeric,
    (p_quote->>'deliverableMod')::numeric, (p_quote->>'combinedMultiplier')::numeric,
    v_total_cents, v_commission_cents, v_contractor_cents,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_quote->'warnings') x), '{}')
  );

  insert into jobs (mission_request_id, client_id, title, service_type, location, status, delivery_responsibility)
    values (v_mr_id, v_client_id, coalesce(p_client_company, p_client_name) || ' — ' || p_service_type,
            p_service_type, p_location, 'scheduled', 'pilot')
    returning id into v_job_id;

  insert into mission_assignments (
    job_id, contractor_id, status, offered_at, accepted_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents, commission_bps_applied
  ) values (
    v_job_id, v_contractor.id, 'accepted', now(), now(),
    v_total_cents, v_contractor_cents, v_commission_cents, v_commission_bps
  );

  return v_job_id;
end;
$function$;
