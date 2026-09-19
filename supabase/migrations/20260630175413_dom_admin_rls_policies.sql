
-- Admin access pattern: a SECURITY DEFINER helper checks the logged-in user's email
-- against the allowlist, then RLS policies grant admins full access from the browser
-- using their authenticated session. Non-admins (anon key alone) stay locked out.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_users where email = auth.jwt() ->> 'email'
  );
$$;

-- Grant admins full access to every operational table.
do $$
declare t text;
begin
  foreach t in array array[
    'contractors','leads','clients','mission_requests','jobs',
    'deliverables','notes','mission_assignments','assignment_sops',
    'sop_documents','payments'
  ]
  loop
    execute format('drop policy if exists "admins full access" on %I;', t);
    execute format(
      'create policy "admins full access" on %I for all to authenticated using (is_admin()) with check (is_admin());', t
    );
  end loop;
end $$;
