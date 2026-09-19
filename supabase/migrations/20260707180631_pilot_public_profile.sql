alter table contractors
  add column if not exists slug text unique,
  add column if not exists bio text,
  add column if not exists tagline text,
  add column if not exists photo_url text,
  add column if not exists website_url text,
  add column if not exists profile_published boolean not null default true;

create table if not exists contractor_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table contractor_portfolio_images enable row level security;

drop policy if exists "admins full access" on contractor_portfolio_images;
create policy "admins full access" on contractor_portfolio_images
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "contractor manages own portfolio" on contractor_portfolio_images;
create policy "contractor manages own portfolio" on contractor_portfolio_images
  for all to authenticated
  using (
    exists (select 1 from contractors c where c.id = contractor_portfolio_images.contractor_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from contractors c where c.id = contractor_portfolio_images.contractor_id and c.user_id = auth.uid())
  );

create index if not exists idx_portfolio_contractor on contractor_portfolio_images(contractor_id);

alter table mission_requests
  add column if not exists requested_contractor_id uuid references contractors(id) on delete set null;
