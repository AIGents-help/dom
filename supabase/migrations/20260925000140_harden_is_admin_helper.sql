-- is_admin() is referenced internally by RLS policies. Prevent it from being
-- exposed as a directly callable RPC while preserving policy evaluation.
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to service_role;

-- RLS policies execute as the invoking authenticated role, so authenticated
-- still needs EXECUTE for policy evaluation. Restore only that required grant.
grant execute on function public.is_admin() to authenticated;
