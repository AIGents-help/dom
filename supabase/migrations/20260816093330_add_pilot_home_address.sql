alter table public.contractors
  add column if not exists home_address text;

comment on column public.contractors.home_address is
  'Private pilot home/dispatch address used as the default mission travel origin; never publish on public profiles.';