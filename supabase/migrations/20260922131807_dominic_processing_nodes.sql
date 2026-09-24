-- DOMINIC Processing Nodes: service-role worker registry used by the local
-- processing agent and sanitized pilot-facing status API.
create table if not exists public.mapping_workers (
  worker_id text primary key,
  display_name text not null,
  status text not null default 'starting'
    check (status in ('starting','ready','processing','degraded','stopping')),
  nodeodm_status text not null default 'unknown'
    check (nodeodm_status in ('unknown','starting','ready','unavailable')),
  docker_status text not null default 'unknown'
    check (docker_status in ('unknown','starting','ready','unavailable','not_managed')),
  current_job_id uuid references public.mapping_processing_jobs(id) on delete set null,
  nodeodm_version text,
  cpu_cores integer,
  available_memory bigint,
  queue_count integer,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mapping_workers_last_seen_at on public.mapping_workers (last_seen_at desc);
alter table public.mapping_workers enable row level security;
drop policy if exists "admins full access" on public.mapping_workers;
create policy "admins full access" on public.mapping_workers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Newer Supabase projects may not auto-grant Data API table access.
grant select, insert, update, delete on public.mapping_workers to service_role;
