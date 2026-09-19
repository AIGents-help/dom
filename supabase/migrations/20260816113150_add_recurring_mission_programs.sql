create table if not exists public.mission_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  service_type text not null,
  location text not null,
  scope text,
  cadence text not null check (cadence in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom')),
  cadence_days integer check (cadence_days is null or cadence_days > 0),
  next_due_on date not null,
  preferred_contractor_id uuid references public.contractors(id) on delete set null,
  default_quote_cents integer,
  status text not null default 'active' check (status in ('draft','active','paused','completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_program_runs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.mission_programs(id) on delete cascade,
  mission_request_id uuid references public.mission_requests(id) on delete set null,
  scheduled_on date not null,
  status text not null default 'planned' check (status in ('planned','created','skipped','completed')),
  created_at timestamptz not null default now(),
  unique(program_id, scheduled_on)
);

create index if not exists mission_programs_next_due_idx on public.mission_programs(status, next_due_on);
create index if not exists mission_program_runs_program_idx on public.mission_program_runs(program_id, scheduled_on desc);
alter table public.mission_programs enable row level security;
alter table public.mission_program_runs enable row level security;
create policy "admins manage mission programs" on public.mission_programs for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage mission program runs" on public.mission_program_runs for all to authenticated using (is_admin()) with check (is_admin());
