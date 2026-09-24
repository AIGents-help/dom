create or replace function public.pilot_create_own_mission_service(
  p_actor_user_id uuid, p_client_name text, p_client_email text, p_client_company text,
  p_location text, p_latitude numeric, p_longitude numeric, p_service_type text,
  p_airspace_class text, p_quote jsonb, p_scope text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_contractor public.contractors%rowtype; v_client_id uuid; v_mr_id uuid; v_job_id uuid;
  v_total_cents integer; v_commission_bps integer; v_commission_cents integer; v_contractor_cents integer;
begin
  select * into v_contractor from public.contractors where user_id=p_actor_user_id;
  if not found or not v_contractor.can_create_missions then raise exception 'not approved for self-service mission creation'; end if;
  if nullif(trim(p_client_name),'') is null or nullif(trim(p_client_email),'') is null then raise exception 'client name and email are required'; end if;
  select id into v_client_id from public.clients where lower(email)=lower(trim(p_client_email));
  if v_client_id is null then
    insert into public.clients(contact_name,company_name,email)
    values(trim(p_client_name),coalesce(nullif(trim(p_client_company),''),trim(p_client_name)),lower(trim(p_client_email))) returning id into v_client_id;
  end if;
  v_total_cents := (p_quote->>'totalCents')::integer;
  if v_total_cents is null or v_total_cents<=0 then raise exception 'invalid mission price'; end if;
  insert into public.mission_requests(requester_name,requester_email,company,service_type,location,latitude,longitude,airspace_class,status,quoted_amount_cents,client_id,scope,created_by_contractor_id,requires_admin_approval)
  values(trim(p_client_name),lower(trim(p_client_email)),p_client_company,p_service_type,p_location,p_latitude,p_longitude,p_airspace_class,'assigned',v_total_cents,v_client_id,p_scope,v_contractor.id,false)
  returning id into v_mr_id;
  v_commission_bps := public.calculate_commission_bps(v_contractor.id,v_total_cents);
  v_commission_cents := round(v_total_cents::numeric*v_commission_bps/10000);
  v_contractor_cents := v_total_cents-v_commission_cents;
  insert into public.quotes(mission_request_id,service_type,base_price_cents,location_mod,airspace_mod,complexity_mod,urgency_mod,deliverable_mod,combined_multiplier,total_cents,commission_cents,contractor_cents,warnings)
  values(v_mr_id,p_service_type,(p_quote->>'basePriceCents')::integer,(p_quote->>'locationMod')::numeric,(p_quote->>'airspaceMod')::numeric,(p_quote->>'complexityMod')::numeric,(p_quote->>'urgencyMod')::numeric,(p_quote->>'deliverableMod')::numeric,(p_quote->>'combinedMultiplier')::numeric,v_total_cents,v_commission_cents,v_contractor_cents,coalesce((select array_agg(x) from jsonb_array_elements_text(p_quote->'warnings') x),'{}'));
  insert into public.jobs(mission_request_id,client_id,title,service_type,location,status,delivery_responsibility)
  values(v_mr_id,v_client_id,coalesce(nullif(trim(p_client_company),''),trim(p_client_name))||' — '||p_service_type,p_service_type,p_location,'scheduled','pilot') returning id into v_job_id;
  insert into public.mission_assignments(job_id,contractor_id,assignment_role,status,offered_at,accepted_at,mission_price_cents,contractor_payout_cents,dom_commission_cents,commission_bps_applied)
  values(v_job_id,v_contractor.id,'owner','accepted',now(),now(),v_total_cents,v_contractor_cents,v_commission_cents,v_commission_bps);
  return v_job_id;
end;
$function$;

create or replace function public.pilot_request_mission_service(p_mission_request_id uuid,p_actor_user_id uuid)
returns void language plpgsql security invoker set search_path=''
as $function$
declare v_contractor public.contractors%rowtype; v_mission public.mission_requests%rowtype; v_missing text[]; v_requirement_count integer; v_id uuid;
begin
  select * into v_contractor from public.contractors where user_id=p_actor_user_id;
  if not found then raise exception 'no contractor profile for this account'; end if;
  if v_contractor.status<>'active' or not v_contractor.part107_verified or not v_contractor.insurance_verified then raise exception 'pilot is not verified — Part 107 and insurance both required'; end if;
  select * into v_mission from public.mission_requests where id=p_mission_request_id;
  if not found then raise exception 'mission not found'; end if;
  select count(*) into v_requirement_count from public.mission_capability_requirements where service_type=v_mission.service_type;
  if v_requirement_count=0 then raise exception 'mission equipment requirements are not configured'; end if;
  select array_agg(r.capability order by r.capability) into v_missing from public.mission_capability_requirements r
  where r.service_type=v_mission.service_type and r.required and not exists(
    select 1 from public.pilot_assets a join public.pilot_asset_capabilities c on c.asset_id=a.id
    where a.contractor_id=v_contractor.id and a.status='active' and a.archived_at is null and a.capabilities_verified and c.capability=r.capability);
  if coalesce(array_length(v_missing,1),0)>0 then raise exception 'pilot equipment is missing required capabilities: %',array_to_string(v_missing,', '); end if;
  update public.mission_requests set status='claimed',claimed_by_contractor_id=v_contractor.id
  where id=p_mission_request_id and status='approved' and claimed_by_contractor_id is null returning id into v_id;
  if v_id is null then raise exception 'mission is no longer available'; end if;
end;
$function$;

create or replace function public.pilot_replace_mission_assets_service(p_mission_assignment_id uuid,p_actor_user_id uuid,p_asset_ids uuid[])
returns uuid[] language plpgsql security invoker set search_path=''
as $function$
declare v_contractor_id uuid; v_service_type text; v_valid_ids uuid[]; v_missing text[]; v_requirement_count integer; v_aircraft_label text; v_aircraft_count integer;
begin
  select ma.contractor_id,j.service_type into v_contractor_id,v_service_type
  from public.mission_assignments ma join public.jobs j on j.id=ma.job_id join public.contractors c on c.id=ma.contractor_id
  where ma.id=p_mission_assignment_id and c.user_id=p_actor_user_id;
  if not found then raise exception 'assignment not found'; end if;
  select coalesce(array_agg(a.id order by a.id),'{}'::uuid[]) into v_valid_ids from public.pilot_assets a
  where a.contractor_id=v_contractor_id and a.id=any(coalesce(p_asset_ids,'{}'::uuid[])) and a.status='active' and a.archived_at is null;
  if cardinality(v_valid_ids)<>cardinality(coalesce(p_asset_ids,'{}'::uuid[])) then raise exception 'one or more selected assets are unavailable or do not belong to this pilot'; end if;
  select count(*) into v_requirement_count from public.mission_capability_requirements where service_type=v_service_type;
  if v_requirement_count=0 then raise exception 'mission equipment requirements are not configured'; end if;
  select array_agg(r.capability order by r.capability) into v_missing from public.mission_capability_requirements r
  where r.service_type=v_service_type and r.required and not exists(select 1 from public.pilot_asset_capabilities c join public.pilot_assets a on a.id=c.asset_id where c.asset_id=any(v_valid_ids) and a.capabilities_verified and c.capability=r.capability);
  if coalesce(array_length(v_missing,1),0)>0 then raise exception 'selected equipment is missing required capabilities: %',array_to_string(v_missing,', '); end if;
  select count(*) into v_aircraft_count from public.pilot_assets a where a.id=any(v_valid_ids) and a.asset_type='uav';
  if v_aircraft_count=0 then raise exception 'select at least one active UAV for this mission'; end if;
  delete from public.mission_asset_assignments where mission_assignment_id=p_mission_assignment_id;
  insert into public.mission_asset_assignments(mission_assignment_id,asset_id,role)
  select p_mission_assignment_id,a.id,case when a.asset_type='uav' then 'aircraft' else 'support' end from public.pilot_assets a where a.id=any(v_valid_ids);
  select string_agg(coalesce(nullif(a.display_name,''),nullif(concat_ws(' ',a.manufacturer,a.model),''),a.asset_type),', ' order by a.id) into v_aircraft_label
  from public.pilot_assets a where a.id=any(v_valid_ids) and a.asset_type='uav';
  update public.mission_assignments set assigned_uav=v_aircraft_label where id=p_mission_assignment_id;
  return v_valid_ids;
end;
$function$;

revoke all on function public.pilot_create_own_mission_service(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.pilot_request_mission_service(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pilot_replace_mission_assets_service(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.pilot_create_own_mission_service(uuid,text,text,text,text,numeric,numeric,text,text,jsonb,text) to service_role;
grant execute on function public.pilot_request_mission_service(uuid,uuid) to service_role;
grant execute on function public.pilot_replace_mission_assets_service(uuid,uuid,uuid[]) to service_role;

revoke all on function public.pilot_create_own_mission(text,text,text,text,numeric,numeric,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.pilot_request_mission(uuid) from public,anon,authenticated;
revoke all on function public.pilot_replace_mission_assets(uuid,uuid[]) from public,anon,authenticated;

alter function public.seed_client_notification_pref() set search_path='public','pg_temp';
alter function public.seed_contractor_notification_pref() set search_path='public','pg_temp';
alter function public.create_notification_preferences_for_client() set search_path='public','pg_temp';
alter function public.create_notification_preferences_for_contractor() set search_path='public','pg_temp';
alter function public.set_updated_at() set search_path='public','pg_temp';
revoke all on function public.seed_client_notification_pref() from public,anon,authenticated;
revoke all on function public.seed_contractor_notification_pref() from public,anon,authenticated;
