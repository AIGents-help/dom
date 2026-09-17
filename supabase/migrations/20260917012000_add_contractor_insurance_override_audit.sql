alter table public.contractors
  add column if not exists insurance_verification_basis text,
  add column if not exists insurance_verification_note text,
  add column if not exists insurance_verified_by uuid references auth.users(id),
  add column if not exists insurance_verified_at timestamptz;

create or replace function public.admin_approve_alternate_insurance(
  p_contractor_id uuid,
  p_actor_user_id uuid,
  p_provider text,
  p_reference text,
  p_expires_on date,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if length(trim(coalesce(p_provider, ''))) < 2
    or length(trim(coalesce(p_reference, ''))) < 2
    or length(trim(coalesce(p_reason, ''))) < 10
    or p_expires_on <= current_date then
    raise exception 'Valid alternate coverage details and a future expiration are required';
  end if;

  update public.contractors
  set insurance_verified = true,
      insurance_requested = false,
      insurance_provider = trim(p_provider),
      insurance_policy_number = trim(p_reference),
      insurance_expires_on = p_expires_on,
      insurance_verification_basis = 'admin_alternate_coverage',
      insurance_verification_note = trim(p_reason),
      insurance_verified_by = p_actor_user_id,
      insurance_verified_at = now()
  where id = p_contractor_id;

  if not found then raise exception 'Contractor not found'; end if;
end;
$function$;

revoke all on function public.admin_approve_alternate_insurance(uuid, uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.admin_approve_alternate_insurance(uuid, uuid, text, text, date, text) to service_role;
