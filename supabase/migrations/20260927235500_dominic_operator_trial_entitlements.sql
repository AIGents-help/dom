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
