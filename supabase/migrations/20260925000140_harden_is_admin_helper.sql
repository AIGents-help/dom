-- is_admin() only needs to answer whether the current authenticated user's
-- own email is present in admin_users. The admin_users RLS policy already
-- permits that self-row lookup, so SECURITY DEFINER is unnecessary.
create or replace function public.is_admin()
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = auth.jwt() ->> 'email'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
