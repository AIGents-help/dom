-- Keep fresh/local databases self-contained. The live DOM project already has
-- this table, but earlier source migrations did not create it, which caused
-- disposable Supabase stacks in CI to fail before the trial entitlement
-- migration could run.
create table if not exists public.dominic_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company text,
  plan text not null default 'free'
    check (plan in ('free','operator','team','organization')),
  status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_profiles_plan_idx
  on public.dominic_profiles (plan);

alter table public.dominic_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dominic_profiles'
      and policyname = 'Users can view their own DOMINIC profile'
  ) then
    create policy "Users can view their own DOMINIC profile"
      on public.dominic_profiles
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

alter table public.dominic_profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

update public.dominic_profiles
set trial_started_at = coalesce(trial_started_at, created_at),
    trial_ends_at = coalesce(trial_ends_at, created_at + interval '30 days')
where trial_started_at is null or trial_ends_at is null;

alter table public.dominic_profiles
  alter column trial_started_at set default now(),
  alter column trial_started_at set not null,
  alter column trial_ends_at set default (now() + interval '30 days'),
  alter column trial_ends_at set not null;

alter table public.dominic_profiles
  drop constraint if exists dominic_profiles_plan_check;

alter table public.dominic_profiles
  add constraint dominic_profiles_plan_check
  check (plan in ('free','operator','team','organization'));
