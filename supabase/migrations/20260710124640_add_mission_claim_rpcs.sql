
alter table mission_requests add column claimed_by_contractor_id uuid references contractors(id);

create or replace function public.pilot_request_mission(p_mission_request_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_contractor record;
  v_id uuid;
begin
  select id, status, part107_verified, insurance_verified into v_contractor
    from contractors where user_id = auth.uid();
  if not found then
    raise exception 'no contractor profile for this account';
  end if;
  if v_contractor.status <> 'active' or not v_contractor.part107_verified or not v_contractor.insurance_verified then
    raise exception 'pilot is not verified — Part 107 and insurance both required';
  end if;

  update mission_requests
    set status = 'claimed', claimed_by_contractor_id = v_contractor.id
    where id = p_mission_request_id
      and status = 'approved'
      and claimed_by_contractor_id is null
    returning id into v_id;

  if v_id is null then
    raise exception 'mission is no longer available';
  end if;
end;
$function$;

create or replace function public.admin_release_mission_claim(p_mission_request_id uuid)
returns void
language plpgsql
as $function$
begin
  update mission_requests
    set status = 'approved', claimed_by_contractor_id = null
    where id = p_mission_request_id
      and status = 'claimed';
end;
$function$;

create or replace function public.admin_offer_mission(p_mission_request_id uuid, p_contractor_id uuid, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
returns uuid
language plpgsql
as $function$
declare
  v_mr record;
  v_quote record;
  v_contractor record;
  v_client_id uuid;
  v_job_id uuid;
begin
  select * into v_mr from mission_requests where id = p_mission_request_id;
  if not found then raise exception 'mission_request not found'; end if;

  select status, part107_verified, insurance_verified into v_contractor
    from contractors where id = p_contractor_id;
  if not found then raise exception 'contractor not found'; end if;
  if v_contractor.status <> 'active' or not v_contractor.part107_verified or not v_contractor.insurance_verified then
    raise exception 'contractor is not active and fully verified (Part 107 + insurance) — cannot offer a mission';
  end if;

  select * into v_quote from quotes where mission_request_id = p_mission_request_id
    order by created_at desc limit 1;

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

  insert into mission_assignments (
    job_id, contractor_id, status, offered_at,
    mission_price_cents, contractor_payout_cents, dom_commission_cents
  ) values (
    v_job_id, p_contractor_id, 'offered', now(),
    v_mr.quoted_amount_cents, v_quote.contractor_cents, v_quote.commission_cents
  );

  update mission_requests set status = 'assigned', claimed_by_contractor_id = null where id = p_mission_request_id;
  return v_job_id;
end;
$function$;
