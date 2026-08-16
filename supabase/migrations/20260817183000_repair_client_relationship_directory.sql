create or replace function public.ensure_client_relationship_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  relationship_id uuid;
begin
  if new.lead_id is not null then
    return new;
  end if;

  if new.email is not null then
    select l.id into relationship_id
    from public.leads l
    where lower(l.email) = lower(new.email)
    order by l.created_at
    limit 1;
  end if;

  if relationship_id is null then
    select l.id into relationship_id
    from public.leads l
    where lower(coalesce(l.company,'')) = lower(coalesce(new.company_name,''))
      and lower(coalesce(l.name,'')) = lower(coalesce(new.contact_name,''))
    order by l.created_at
    limit 1;
  end if;

  if relationship_id is null then
    insert into public.leads (name,email,company,phone,industry,status,source,next_action)
    values (new.contact_name,new.email,new.company_name,new.phone,new.industry,'won','client_relationship_sync','Active client relationship')
    returning id into relationship_id;
  else
    update public.leads
    set status='won',
        name=coalesce(name,new.contact_name),
        company=coalesce(company,new.company_name),
        email=coalesce(email,new.email),
        phone=coalesce(phone,new.phone),
        industry=coalesce(industry,new.industry)
    where id=relationship_id;
  end if;

  new.lead_id := relationship_id;
  return new;
end;
$$;

revoke execute on function public.ensure_client_relationship_lead() from public,anon,authenticated;

drop trigger if exists ensure_client_relationship_lead_trigger on public.clients;
create trigger ensure_client_relationship_lead_trigger
before insert or update on public.clients
for each row
execute function public.ensure_client_relationship_lead();

-- Repair legacy clients created before the unified relationship workflow.
-- The no-op assignment intentionally invokes the synchronization trigger.
update public.clients
set company_name=company_name
where lead_id is null;

comment on function public.ensure_client_relationship_lead() is
  'Keeps every client visible in the unified Leads/Clients relationship directory and repairs orphan client records.';
