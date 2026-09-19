alter table public.quotes
  add column if not exists client_response_notes text,
  add column if not exists responded_by uuid references auth.users(id);

alter table public.mission_change_orders
  add column if not exists responded_by uuid references auth.users(id);

create or replace function public.protect_sent_quote_pricing()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if old.sent_at is not null and (
    new.mission_request_id is distinct from old.mission_request_id or
    new.service_type is distinct from old.service_type or
    new.base_price_cents is distinct from old.base_price_cents or
    new.location_mod is distinct from old.location_mod or
    new.airspace_mod is distinct from old.airspace_mod or
    new.complexity_mod is distinct from old.complexity_mod or
    new.urgency_mod is distinct from old.urgency_mod or
    new.deliverable_mod is distinct from old.deliverable_mod or
    new.combined_multiplier is distinct from old.combined_multiplier or
    new.total_cents is distinct from old.total_cents or
    new.commission_cents is distinct from old.commission_cents or
    new.contractor_cents is distinct from old.contractor_cents or
    new.version_number is distinct from old.version_number or
    new.supersedes_quote_id is distinct from old.supersedes_quote_id
  ) then
    raise exception 'Sent quote pricing is immutable; create a new version';
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_sent_quote_pricing_trigger on public.quotes;
create trigger protect_sent_quote_pricing_trigger
before update on public.quotes
for each row execute function public.protect_sent_quote_pricing();

create or replace function public.protect_sent_change_order_terms()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if old.sent_at is not null and (
    new.mission_request_id is distinct from old.mission_request_id or
    new.quote_id is distinct from old.quote_id or
    new.title is distinct from old.title or
    new.reason is distinct from old.reason or
    new.scope_delta is distinct from old.scope_delta or
    new.amount_delta_cents is distinct from old.amount_delta_cents
  ) then raise exception 'Sent change-order terms are immutable'; end if;
  return new;
end;
$function$;

drop trigger if exists protect_sent_change_order_terms_trigger on public.mission_change_orders;
create trigger protect_sent_change_order_terms_trigger
before update on public.mission_change_orders
for each row execute function public.protect_sent_change_order_terms();

create or replace function public.client_respond_quote_service(
  p_quote_id uuid, p_actor_user_id uuid, p_decision text, p_notes text default null
)
returns void language plpgsql security invoker set search_path=''
as $function$
declare
  v_quote public.quotes%rowtype;
  v_mission public.mission_requests%rowtype;
begin
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid quote decision'; end if;
  select q.* into v_quote from public.quotes q
  join public.mission_requests mr on mr.id=q.mission_request_id
  join public.clients c on c.id=mr.client_id
  where q.id=p_quote_id and c.user_id=p_actor_user_id for update;
  if not found then raise exception 'Quote not found for this client'; end if;
  if v_quote.status<>'sent' or v_quote.sent_at is null then raise exception 'Only a sent quote can be decided'; end if;
  if v_quote.expires_at is not null and v_quote.expires_at<now() then raise exception 'This quote has expired'; end if;
  if exists(select 1 from public.quotes where mission_request_id=v_quote.mission_request_id and version_number>v_quote.version_number and status in ('sent','accepted')) then
    raise exception 'A newer quote version is available';
  end if;
  update public.quotes set
    status=p_decision, accepted_at=case when p_decision='accepted' then now() else null end,
    rejected_at=case when p_decision='rejected' then now() else null end,
    locked_at=coalesce(locked_at,now()), client_response_notes=nullif(left(trim(coalesce(p_notes,'')),2000),''),
    responded_by=p_actor_user_id
  where id=p_quote_id;
  select * into v_mission from public.mission_requests where id=v_quote.mission_request_id for update;
  if p_decision='accepted' then
    update public.mission_requests set quoted_amount_cents=v_quote.total_cents,
      status=case when created_by_contractor_id is null and status in ('requested','reviewing','scoped','quoted') then 'approved' else status end
    where id=v_mission.id;
  end if;
  insert into public.mission_activity_events(mission_request_id,actor_user_id,actor_role,visibility,event_type,summary,details)
  values(v_mission.id,p_actor_user_id,'client','shared','quote_'||p_decision,
    'Client '||p_decision||' quote version '||v_quote.version_number,
    jsonb_build_object('quote_id',v_quote.id,'version',v_quote.version_number,'total_cents',v_quote.total_cents,'notes',nullif(left(trim(coalesce(p_notes,'')),2000),'')));
end;
$function$;

create or replace function public.client_respond_change_order_service(
  p_change_order_id uuid, p_actor_user_id uuid, p_decision text, p_notes text default null
)
returns void language plpgsql security invoker set search_path=''
as $function$
declare v_change public.mission_change_orders%rowtype;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Invalid change-order decision'; end if;
  select co.* into v_change from public.mission_change_orders co
  join public.mission_requests mr on mr.id=co.mission_request_id
  join public.clients c on c.id=mr.client_id
  where co.id=p_change_order_id and c.user_id=p_actor_user_id for update;
  if not found then raise exception 'Change order not found for this client'; end if;
  if v_change.status<>'sent' or v_change.sent_at is null then raise exception 'Only a sent change order can be decided'; end if;
  update public.mission_change_orders set status=p_decision,responded_at=now(),
    client_response_notes=nullif(left(trim(coalesce(p_notes,'')),2000),''),responded_by=p_actor_user_id
  where id=p_change_order_id;
  insert into public.mission_activity_events(mission_request_id,actor_user_id,actor_role,visibility,event_type,summary,details)
  values(v_change.mission_request_id,p_actor_user_id,'client','shared','change_order_'||p_decision,
    'Client '||p_decision||' change order: '||v_change.title,
    jsonb_build_object('change_order_id',v_change.id,'amount_delta_cents',v_change.amount_delta_cents,'notes',nullif(left(trim(coalesce(p_notes,'')),2000),'')));
end;
$function$;

revoke all on function public.client_respond_quote_service(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.client_respond_change_order_service(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.client_respond_quote_service(uuid,uuid,text,text) to service_role;
grant execute on function public.client_respond_change_order_service(uuid,uuid,text,text) to service_role;

revoke all on function public.protect_sent_quote_pricing() from public,anon,authenticated;
revoke all on function public.protect_sent_change_order_terms() from public,anon,authenticated;
revoke insert,update,delete on table public.quotes from anon,authenticated;
revoke insert,update,delete on table public.mission_change_orders from anon,authenticated;
