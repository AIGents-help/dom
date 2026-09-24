alter table public.mission_requests
  add column if not exists client_profile_sync_enabled boolean not null default true;

comment on column public.mission_requests.client_profile_sync_enabled is
  'When true, open missions use current linked-client identity/contact fields. Disable for a mission-specific requester override; closed records remain frozen.';

create or replace function public.sync_client_profile_relationships()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A direct client-profile edit updates its unified relationship listing.
  -- When called by the reciprocal lead trigger, skip this step to avoid a loop.
  if pg_trigger_depth() = 1 and new.lead_id is not null then
    update public.leads
    set name=new.contact_name,
        company=new.company_name,
        email=new.email,
        phone=new.phone,
        industry=new.industry,
        status='won'
    where id=new.lead_id;
  end if;

  -- Open missions follow the current client profile unless Admin selected
  -- a mission-specific override. Closed/cancelled history is never rewritten.
  update public.mission_requests
  set requester_name=new.contact_name,
      requester_email=new.email,
      company=new.company_name
  where client_id=new.id
    and client_profile_sync_enabled=true
    and status::text not in ('delivered','closed','cancelled');

  return new;
end;
$$;

create or replace function public.sync_lead_profile_to_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 then
    update public.clients
    set contact_name=new.name,
        company_name=coalesce(new.company,new.name,'Unnamed'),
        email=new.email,
        phone=new.phone,
        industry=new.industry
    where lead_id=new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_client_profile_relationships() from public,anon,authenticated;
revoke execute on function public.sync_lead_profile_to_client() from public,anon,authenticated;

drop trigger if exists sync_client_profile_relationships_trigger on public.clients;
create trigger sync_client_profile_relationships_trigger
after update of contact_name,company_name,email,phone,industry on public.clients
for each row
when (
  old.contact_name is distinct from new.contact_name or
  old.company_name is distinct from new.company_name or
  old.email is distinct from new.email or
  old.phone is distinct from new.phone or
  old.industry is distinct from new.industry
)
execute function public.sync_client_profile_relationships();

drop trigger if exists sync_lead_profile_to_client_trigger on public.leads;
create trigger sync_lead_profile_to_client_trigger
after update of name,company,email,phone,industry on public.leads
for each row
when (
  old.name is distinct from new.name or
  old.company is distinct from new.company or
  old.email is distinct from new.email or
  old.phone is distinct from new.phone or
  old.industry is distinct from new.industry
)
execute function public.sync_lead_profile_to_client();

-- Bring every currently open linked mission onto the live profile once.
update public.clients
set company_name=company_name;
