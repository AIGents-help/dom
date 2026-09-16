-- Keep staffing atomic: one job per request, one offer per pilot, and no
-- competing live assignment for the same job. Existing production data was
-- checked for conflicts before these indexes were added.
create unique index if not exists jobs_mission_request_unique_idx
  on public.jobs (mission_request_id)
  where mission_request_id is not null;

create unique index if not exists mission_assignments_job_contractor_unique_idx
  on public.mission_assignments (job_id, contractor_id)
  where contractor_id is not null;

create unique index if not exists mission_assignments_one_active_per_job_idx
  on public.mission_assignments (job_id)
  where status not in ('declined'::public.assignment_status, 'cancelled'::public.assignment_status);

create or replace function public.admin_offer_mission(
  p_mission_request_id uuid,
  p_contractor_id uuid,
  p_scheduled_for timestamptz default null
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_mr public.mission_requests%rowtype;
  v_contractor public.contractors%rowtype;
  v_client_id uuid;
  v_job_id uuid;
  v_assignment_id uuid;
  v_commission_bps integer;
  v_commission_cents integer;
  v_contractor_cents integer;
begin
  select * into v_mr
  from public.mission_requests
  where id = p_mission_request_id
  for update;

  if not found then
    raise exception 'Mission not found.';
  end if;
  if v_mr.status in ('cancelled', 'delivered', 'closed') then
    raise exception 'This mission can no longer be offered.';
  end if;
  if v_mr.quoted_amount_cents is null or v_mr.quoted_amount_cents <= 0 then
    raise exception 'Add a valid quoted total before offering this mission.';
  end if;

  select * into v_contractor
  from public.contractors
  where id = p_contractor_id;

  if not found then
    raise exception 'Pilot not found.';
  end if;
  if v_contractor.status <> 'active'
     or not v_contractor.part107_verified
     or not v_contractor.insurance_verified then
    raise exception 'Pilot must be active with verified Part 107 and insurance.';
  end if;

  select id into v_job_id
  from public.jobs
  where mission_request_id = p_mission_request_id
  for update;

  if v_job_id is not null then
    if exists (
      select 1
      from public.mission_assignments
      where job_id = v_job_id
        and status not in ('declined', 'cancelled')
    ) then
      raise exception 'This mission already has an active pilot offer or assignment.';
    end if;

    if exists (
      select 1
      from public.mission_assignments
      where job_id = v_job_id
        and contractor_id = p_contractor_id
    ) then
      raise exception 'This pilot has already received this mission. Choose a different pilot.';
    end if;

    update public.jobs
    set scheduled_for = coalesce(p_scheduled_for, scheduled_for),
        status = 'scheduled'
    where id = v_job_id;
  else
    v_client_id := v_mr.client_id;

    if v_client_id is null and v_mr.requester_email is not null then
      select id into v_client_id
      from public.clients
      where lower(email) = lower(v_mr.requester_email)
      limit 1;
    end if;

    if v_client_id is null then
      insert into public.clients (contact_name, company_name, email)
      values (
        v_mr.requester_name,
        coalesce(v_mr.company, v_mr.requester_name),
        v_mr.requester_email
      )
      returning id into v_client_id;
    end if;

    insert into public.jobs (
      mission_request_id,
      client_id,
      title,
      service_type,
      location,
      scheduled_for,
      status
    )
    values (
      p_mission_request_id,
      v_client_id,
      coalesce(v_mr.company, v_mr.requester_name, 'Mission') || ' — ' || coalesce(v_mr.service_type, 'custom'),
      v_mr.service_type,
      v_mr.location,
      p_scheduled_for,
      'scheduled'
    )
    returning id into v_job_id;
  end if;

  v_commission_bps := public.calculate_commission_bps(p_contractor_id, v_mr.quoted_amount_cents);
  v_commission_cents := round(v_mr.quoted_amount_cents::numeric * v_commission_bps / 10000);
  v_contractor_cents := v_mr.quoted_amount_cents - v_commission_cents;

  insert into public.mission_assignments (
    job_id,
    contractor_id,
    status,
    offered_at,
    mission_price_cents,
    contractor_payout_cents,
    dom_commission_cents,
    commission_bps_applied
  )
  values (
    v_job_id,
    p_contractor_id,
    'offered',
    now(),
    v_mr.quoted_amount_cents,
    v_contractor_cents,
    v_commission_cents,
    v_commission_bps
  )
  returning id into v_assignment_id;

  update public.mission_requests
  set status = 'assigned',
      claimed_by_contractor_id = null
  where id = p_mission_request_id;

  return v_assignment_id;
end;
$function$;

revoke all on function public.admin_offer_mission(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_offer_mission(uuid, uuid, timestamptz) to service_role;
