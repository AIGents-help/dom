create table if not exists public.dominic_capture_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Capture Plan',
  mission_type text not null check (mission_type in ('object','roof','building','facade','interior','stockpile','corridor')),
  schema_version integer not null default 1 check (schema_version > 0),
  plan_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_capture_plans_user_updated_idx
  on public.dominic_capture_plans(user_id, updated_at desc);

alter table public.dominic_capture_plans enable row level security;

grant select, insert, update, delete on table public.dominic_capture_plans to authenticated;
grant all on table public.dominic_capture_plans to service_role;

drop policy if exists "Users read own DOMINIC capture plans" on public.dominic_capture_plans;
create policy "Users read own DOMINIC capture plans"
  on public.dominic_capture_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own DOMINIC capture plans" on public.dominic_capture_plans;
create policy "Users create own DOMINIC capture plans"
  on public.dominic_capture_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own DOMINIC capture plans" on public.dominic_capture_plans;
create policy "Users update own DOMINIC capture plans"
  on public.dominic_capture_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own DOMINIC capture plans" on public.dominic_capture_plans;
create policy "Users delete own DOMINIC capture plans"
  on public.dominic_capture_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists dominic_capture_plans_set_updated_at on public.dominic_capture_plans;
create trigger dominic_capture_plans_set_updated_at
  before update on public.dominic_capture_plans
  for each row execute function public.set_updated_at();
