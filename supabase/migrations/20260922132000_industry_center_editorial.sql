-- DOM Industry Center editorial content and events
create table if not exists industry_posts (
  id uuid primary key default gen_random_uuid(),
  content_type text not null default 'article' check (content_type in ('article','event')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  category text not null default 'Operations',
  title text not null,
  slug text not null unique,
  dek text,
  body text,
  pilot_impact text,
  source_name text,
  source_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  registration_url text,
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists industry_posts_status_published_idx
  on industry_posts(status, published_at desc);
create index if not exists industry_posts_type_starts_idx
  on industry_posts(content_type, starts_at);

alter table industry_posts enable row level security;

drop policy if exists "public reads published industry posts" on industry_posts;
create policy "public reads published industry posts"
on industry_posts for select
to anon, authenticated
using (status = 'published' and published_at is not null);

drop policy if exists "admins manage industry posts" on industry_posts;
create policy "admins manage industry posts"
on industry_posts for all
to authenticated
using (is_admin())
with check (is_admin());
