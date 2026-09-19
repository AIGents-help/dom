create or replace function public.admin_offer_mission(
  p_mission_request_id uuid,
  p_contractor_id uuid,
  p_scheduled_for timestamptz default null
) returns uuid
language plpgsql
as $$
declare
  v_mr record;
  v_quote record;
  v_client_id uuid;
  v_job_id uuid;
begin
  select * into v_mr from mission_requests where id = p_mission_request_id;
  if not found then raise exception 'mission_request not found'; end if;

  select * into v_quote from quotes where mission_request_id = p_mission_request_id
    order by created_at desc limit 1;

  select id into v_client_id from clients where lower(email) = lower(v_mr.requester_email);
  if v_client_id is null then
    insert into clients (contact_name, company_name, email)
      values (v_mr.requester_name, v_mr.company, v_mr.requester_email)
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

  update mission_requests set status = 'assigned' where id = p_mission_request_id;
  return v_job_id;
end;
$$;