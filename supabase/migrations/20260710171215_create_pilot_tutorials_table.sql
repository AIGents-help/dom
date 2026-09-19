
create table pilot_tutorials (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text,
  is_premium boolean not null default false,
  is_current boolean not null default true,
  version integer not null default 1,
  body_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pilot_tutorials enable row level security;

create policy "admins full access" on pilot_tutorials
  for all to authenticated
  using (is_admin())
  with check (is_admin());
