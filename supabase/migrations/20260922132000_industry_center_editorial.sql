-- DOM Industry Center: owner idea inbox + AI-generated editorial drafts.

create table if not exists industry_ideas (
  id uuid primary key default gen_random_uuid(),
  heading text not null,
  question text,
  notes text,
  source_url text,
  category text not null default 'Operations',
  status text not null default 'idea' check (status in ('idea','generating','draft_created','dismissed')),
  generated_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  generated_by_ai boolean not null default false,
  generated_from_idea_id uuid references industry_ideas(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table industry_ideas
  drop constraint if exists industry_ideas_generated_post_id_fkey;
alter table industry_ideas
  add constraint industry_ideas_generated_post_id_fkey
  foreign key (generated_post_id) references industry_posts(id) on delete set null;

create index if not exists industry_posts_status_published_idx
  on industry_posts(status, published_at desc);
create index if not exists industry_posts_type_starts_idx
  on industry_posts(content_type, starts_at);
create index if not exists industry_ideas_status_created_idx
  on industry_ideas(status, created_at desc);

grant select on table public.industry_posts to anon;
grant select, insert, update, delete on table public.industry_posts to authenticated;
grant select, insert, update, delete on table public.industry_posts to service_role;

grant select, insert, update, delete on table public.industry_ideas to authenticated;
grant select, insert, update, delete on table public.industry_ideas to service_role;
revoke all on table public.industry_ideas from anon;

alter table industry_posts enable row level security;
alter table industry_ideas enable row level security;

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

drop policy if exists "admins manage industry ideas" on industry_ideas;
create policy "admins manage industry ideas"
on industry_ideas for all
to authenticated
using (is_admin())
with check (is_admin());

insert into industry_ideas (heading, question, notes, source_url, category)
select
  'When You CAN Fly / When You CAN''T Fly',
  'What conditions make a Part 107 drone operation legal, restricted, or prohibited?',
  'Create a plain-English pilot reference covering airspace authorization, TFRs, VLOS, altitude, night operations, operations over people and vehicles, Remote ID, weather/visibility, emergency restrictions, and when a waiver or authorization may be required. Keep it current and source every regulatory claim.',
  'https://www.faa.gov/uas/commercial_operators',
  'FAA & Regulation'
where not exists (
  select 1 from industry_ideas where lower(heading) = lower('When You CAN Fly / When You CAN''T Fly')
);
