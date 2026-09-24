create or replace function public.pilot_create_own_mission_service(
  p_actor_user_id uuid, p_client_name text, p_client_email text, p_client_company text,
  p_location text, p_latitude numeric, p_longitude numeric, p_service_type text,
  p_airspace_class text, p_quote jsonb, p_scope text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_contractor public.contractors%rowtype;
  v_client_id uuid;
  v_mr_id uuid;
  v_job_id uuid;
  v_assignment_id uuid;
  v_total_cents integer;
  v_commission_bps integer;
  v_commission_cents integer;
  v_contractor_cents integer;
  v_personal_insurance_current boolean;
  v_uninsured_acknowledged boolean;
  v_uninsured_terms_version text;
begin
  select * into v_contractor
  from public.contractors
  where user_id = p_actor_user_id;

  if not found or not v_contractor.can_create_missions then
    raise exception 'not approved for self-service mission creation';
  end if;

  v_personal_insurance_current :=
    coalesce(v_contractor.insurance_verified, false)
    and v_contractor.insurance_expires_on is not null
    and v_contractor.insurance_expires_on >= current_date;

  v_uninsured_acknowledged :=
    coalesce((p_quote ->> 'uninsuredAcknowledged')::boolean, false);
  v_uninsured_terms_version :=
    nullif(trim(coalesce(p_quote ->> 'uninsuredTermsVersion', '')), '');

  if not v_personal_insurance_current then
    if not coalesce(v_contractor.uninsured_self_service_eligible, false) then
      raise exception 'A current verified insurance policy or Admin-authorized uninsured self-service path is required';
    end if;
    if not v_uninsured_acknowledged or v_uninsured_terms_version is null then
      raise exception 'Per-mission uninsured responsibility acknowledgement is required';
    end if;
  end if;

  if nullif(trim(p_client_name), '') is null or nullif(trim(p_client_email), '') is null then
    raise exception 'client name and email are required';
  end if;

  select id into v_client_id
  from public.clients
  where lower(email) = lower(trim(p_client_email));

  if v_client_id is null then
    insert into public.clients(contact_name, company_name, email)
    values(
      trim(p_client_name),
      coalesce(nullif(trim(p_client_company), ''), trim(p_client_name)),
      lower(trim(p_client_email))
    )
    returning id into v_client_id;
  end if;

  v_total_cents := (p_quote ->> 'totalCents')::integer;
  if v_total_cents is null or v_total_cents <= 0 then
    raise exception 'invalid mission price';
  end if;

  insert into public.mission_requests(
    requester_name, requester_email, company, service_type, location,
    latitude, longitude, airspace_class, status, quoted_amount_cents,
    client_id, scope, created_by_contractor_id, requires_admin_approval
  )
  values(
    trim(p_client_name), lower(trim(p_client_email)), p_client_company, p_service_type, p_location,
    p_latitude, p_longitude, p_airspace_class, 'assigned', v_total_cents,
    v_client_id, p_scope, v_contractor.id, false
  )
  returning id into v_mr_id;

  v_commission_bps := public.calculate_commission_bps(v_contractor.id, v_total_cents);
  v_commission_cents := round(v_total_cents::numeric * v_commission_bps / 10000);
  v_contractor_cents := v_total_cents - v_commission_cents;

  insert into public.quotes(
    mission_request_id, service_type, base_price_cents, location_mod, airspace_mod,
    complexity_mod, urgency_mod, deliverable_mod, combined_multiplier, total_cents,
    commission_cents, contractor_cents, warnings
  )
  values(
    v_mr_id, p_service_type, (p_quote ->> 'basePriceCents')::integer,
    (p_quote ->> 'locationMod')::numeric, (p_quote ->> 'airspaceMod')::numeric,
    (p_quote ->> 'complexityMod')::numeric, (p_quote ->> 'urgencyMod')::numeric,
    (p_quote ->> 'deliverableMod')::numeric, (p_quote ->> 'combinedMultiplier')::numeric,
    v_total_cents, v_commission_cents, v_contractor_cents,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_quote -> 'warnings') x), '{}')
  );

  insert into public.jobs(
    mission_request_id, client_id, title, service_type, location, status, delivery_responsibility
  )
  values(
    v_mr_id, v_client_id,
    coalesce(nullif(trim(p_client_company), ''), trim(p_client_name)) || ' — ' || p_service_type,
    p_service_type, p_location, 'scheduled', 'pilot'
  )
  returning id into v_job_id;

  insert into public.mission_assignments(
    job_id, contractor_id, assignment_role, status, offered_at, accepted_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents, commission_bps_applied,
    insurance_source, mission_insurance_verified, mission_insurance_reference,
    mission_insurance_expires_at, mission_insurance_coi_path
  )
  values(
    v_job_id, v_contractor.id, 'owner', 'accepted', now(), now(),
    v_total_cents, v_contractor_cents, v_commission_cents, v_commission_bps,
    case when v_personal_insurance_current then 'pilot_policy' else 'pilot_uninsured_acknowledgement' end,
    v_personal_insurance_current,
    case when v_personal_insurance_current then v_contractor.insurance_policy_number else v_uninsured_terms_version end,
    case
      when v_personal_insurance_current
      then ((v_contractor.insurance_expires_on::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC')
      else null
    end,
    case when v_personal_insurance_current then v_contractor.insurance_coi_path else null end
  )
  returning id into v_assignment_id;

  if not v_personal_insurance_current then
    insert into public.mission_activity_events(
      mission_request_id, job_id, assignment_id, actor_user_id,
      actor_role, visibility, event_type, summary, details
    )
    values(
      v_mr_id, v_job_id, v_assignment_id, p_actor_user_id,
      'pilot', 'shared', 'uninsured_responsibility_acknowledged',
      'Pilot elected to proceed without a verified insurance policy',
      jsonb_build_object('terms_version', v_uninsured_terms_version, 'recorded_during', 'mission_creation')
    );
  end if;

  return v_job_id;
end;
$function$;

revoke all on function public.pilot_create_own_mission_service(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.pilot_create_own_mission_service(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text) to service_role;