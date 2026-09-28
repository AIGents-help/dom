-- Atomic Admin CRM lead -> client conversion.
-- Keeps client linking, lead status, and conversion history in one transaction.
create or replace function public.admin_convert_lead_to_client_service(
  p_lead_id uuid,
  p_existing_client_id uuid default null,
  p_actor text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_lead public.leads%rowtype;
  v_client public.clients%rowtype;
  v_client_id uuid;
begin
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  select * into v_client
  from public.clients
  where lead_id = v_lead.id
  limit 1
  for update;

  if found then
    update public.clients
    set contact_name = coalesce(contact_name, v_lead.name),
        email = coalesce(email, v_lead.email),
        phone = coalesce(phone, v_lead.phone),
        industry = coalesce(industry, v_lead.industry)
    where id = v_client.id
    returning id into v_client_id;

    update public.leads set status = 'won' where id = v_lead.id and status <> 'won';

    if not exists (
      select 1 from public.lead_activities
      where lead_id = v_lead.id
        and summary = 'Linked to existing client (status: Won)'
    ) then
      insert into public.lead_activities (lead_id, activity_type, summary, created_by)
      values (
        v_lead.id,
        'status_change',
        'Linked to existing client (status: Won)',
        nullif(trim(p_actor), '')
      );
    end if;

    return v_client_id;
  end if;

  if p_existing_client_id is not null then
    select * into v_client
    from public.clients
    where id = p_existing_client_id
    for update;

    if not found then
      raise exception 'Client not found';
    end if;

    if v_client.lead_id is not null and v_client.lead_id is distinct from v_lead.id then
      raise exception 'Client is already linked to another lead';
    end if;

    update public.clients
    set lead_id = v_lead.id,
        contact_name = coalesce(contact_name, v_lead.name),
        email = coalesce(email, v_lead.email),
        phone = coalesce(phone, v_lead.phone),
        industry = coalesce(industry, v_lead.industry)
    where id = v_client.id
    returning id into v_client_id;
  else
    if v_lead.email is not null and exists (
      select 1 from public.clients
      where lower(email) = lower(v_lead.email)
    ) then
      raise exception 'A client with this email already exists; link that client explicitly';
    end if;

    insert into public.clients (
      company_name, contact_name, email, phone, industry, lead_id
    ) values (
      coalesce(nullif(v_lead.company, ''), nullif(v_lead.name, ''), 'Unnamed'),
      v_lead.name,
      v_lead.email,
      v_lead.phone,
      v_lead.industry,
      v_lead.id
    )
    returning id into v_client_id;
  end if;

  update public.leads
  set status = 'won'
  where id = v_lead.id;

  insert into public.lead_activities (
    lead_id, activity_type, summary, created_by
  ) values (
    v_lead.id,
    'status_change',
    case when p_existing_client_id is null
      then 'Converted to client (status: Won)'
      else 'Linked to existing client (status: Won)'
    end,
    nullif(trim(p_actor), '')
  );

  return v_client_id;
end;
$function$;

revoke all on function public.admin_convert_lead_to_client_service(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_convert_lead_to_client_service(uuid, uuid, text) to service_role;
