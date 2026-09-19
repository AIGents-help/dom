create or replace function public.pilot_create_own_mission(
  p_client_name text,
  p_client_email text,
  p_client_company text,
  p_location text,
  p_latitude numeric,
  p_longitude numeric,
  p_service_type text,
  p_airspace_class text,
  p_quote jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_contractor record;
  v_client_id uuid;
  v_mr_id uuid;
  v_job_id uuid;
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

  insert into mission_requests (
    requester_name, requester_email, company, service_type, location,
    latitude, longitude, airspace_class, status, quoted_amount_cents, client_id
  ) values (
    p_client_name, p_client_email, p_client_company, p_service_type, p_location,
    p_latitude, p_longitude, p_airspace_class, 'assigned', (p_quote->>'totalCents')::int, v_client_id
  ) returning id into v_mr_id;

  insert into quotes (
    mission_request_id, service_type, base_price_cents, location_mod, airspace_mod,
    complexity_mod, urgency_mod, deliverable_mod, combined_multiplier, total_cents,
    commission_cents, contractor_cents, warnings
  ) values (
    v_mr_id, p_service_type, (p_quote->>'basePriceCents')::int,
    (p_quote->>'locationMod')::numeric, (p_quote->>'airspaceMod')::numeric,
    (p_quote->>'complexityMod')::numeric, (p_quote->>'urgencyMod')::numeric,
    (p_quote->>'deliverableMod')::numeric, (p_quote->>'combinedMultiplier')::numeric,
    (p_quote->>'totalCents')::int, (p_quote->>'commissionCents')::int,
    (p_quote->>'contractorCents')::int,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_quote->'warnings') x), '{}')
  );

  insert into jobs (mission_request_id, client_id, title, service_type, location, status)
    values (v_mr_id, v_client_id, coalesce(p_client_company, p_client_name) || ' — ' || p_service_type,
            p_service_type, p_location, 'scheduled')
    returning id into v_job_id;

  insert into mission_assignments (
    job_id, contractor_id, status, offered_at, accepted_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents
  ) values (
    v_job_id, v_contractor.id, 'accepted', now(), now(),
    (p_quote->>'totalCents')::int, (p_quote->>'contractorCents')::int, (p_quote->>'commissionCents')::int
  );

  return v_job_id;
end;
$$;

grant execute on function pilot_create_own_mission(text,text,text,text,numeric,numeric,text,text,jsonb) to authenticated;