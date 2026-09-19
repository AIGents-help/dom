
-- Admin allowlist: emails authorized to reach the DOM admin console.
-- NO passwords stored here. Passwords live only in Supabase Auth, set by the user.
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  role text not null default 'admin',   -- 'admin' | 'owner'
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- An authenticated user may check whether their OWN email is on the allowlist.
drop policy if exists "admins can read own allowlist row" on admin_users;
create policy "admins can read own allowlist row"
  on admin_users for select
  to authenticated
  using (email = auth.jwt() ->> 'email');
