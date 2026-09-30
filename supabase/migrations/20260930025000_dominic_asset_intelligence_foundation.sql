-- DOMINIC Asset Intelligence foundation
-- Persistent real-world memory: Asset -> Inspection -> Finding -> Issue.
-- Additive only. Existing mission, mapping, capture-plan, and flight systems remain intact.

create table if not exists public.dominic_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  parent_asset_id uuid references public.dominic_assets(id) on delete set null,
  name text not null,
  asset_type text not null,
  external_ref text,
  description text,
  status text not null default 'active'
    check (status in ('active','monitoring','retired')),
  condition_state text not null default 'unknown'
    check (condition_state in ('unknown','normal','watch','degraded','critical')),
  condition_score numeric
    check (condition_score is null or (condition_score >= 0 and condition_score <= 100)),
  condition_updated_at timestamptz,
  location_label text,
  latitude numeric,
  longitude numeric,
  altitude_ft numeric,
  geometry jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  baseline_at timestamptz,
  last_inspected_at timestamptz,
  next_inspection_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dominic_assets_user_external_ref_uidx
  on public.dominic_assets(user_id, external_ref)
  where external_ref is not null;
create index if not exists dominic_assets_user_status_idx
  on public.dominic_assets(user_id, status, updated_at desc);
create index if not exists dominic_assets_client_idx
  on public.dominic_assets(client_id)
  where client_id is not null;
create index if not exists dominic_assets_parent_idx
  on public.dominic_assets(parent_asset_id)
  where parent_asset_id is not null;
create index if not exists dominic_assets_condition_idx
  on public.dominic_assets(user_id, condition_state, condition_updated_at desc);

drop trigger if exists dominic_assets_set_updated_at on public.dominic_assets;
create trigger dominic_assets_set_updated_at
  before update on public.dominic_assets
  for each row execute function public.set_updated_at();

create table if not exists public.dominic_inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.dominic_assets(id),
  mission_request_id uuid references public.mission_requests(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  mapping_project_id uuid references public.mapping_projects(id) on delete set null,
  capture_plan_id uuid references public.dominic_capture_plans(id) on delete set null,
  baseline_inspection_id uuid references public.dominic_inspections(id) on delete set null,
  inspection_type text not null,
  objective text,
  status text not null default 'planned'
    check (status in ('planned','capturing','analyzing','review','complete','cancelled')),
  capture_source text not null default 'manual'
    check (capture_source in ('map','live_drone','local_object','manual','dock','upload')),
  sensor_modes text[] not null default '{}'::text[],
  started_at timestamptz,
  completed_at timestamptz,
  health_score numeric
    check (health_score is null or (health_score >= 0 and health_score <= 100)),
  summary text,
  ai_summary jsonb not null default '{}'::jsonb,
  environmental_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_inspections_asset_idx
  on public.dominic_inspections(asset_id);
create index if not exists dominic_inspections_baseline_idx
  on public.dominic_inspections(baseline_inspection_id)
  where baseline_inspection_id is not null;
create index if not exists dominic_inspections_user_asset_idx
  on public.dominic_inspections(user_id, asset_id, created_at desc);
create index if not exists dominic_inspections_status_idx
  on public.dominic_inspections(user_id, status, created_at desc);
create index if not exists dominic_inspections_mission_idx
  on public.dominic_inspections(mission_request_id)
  where mission_request_id is not null;
create index if not exists dominic_inspections_job_idx
  on public.dominic_inspections(job_id)
  where job_id is not null;
create index if not exists dominic_inspections_mapping_project_idx
  on public.dominic_inspections(mapping_project_id)
  where mapping_project_id is not null;
create index if not exists dominic_inspections_capture_plan_idx
  on public.dominic_inspections(capture_plan_id)
  where capture_plan_id is not null;

drop trigger if exists dominic_inspections_set_updated_at on public.dominic_inspections;
create trigger dominic_inspections_set_updated_at
  before update on public.dominic_inspections
  for each row execute function public.set_updated_at();

create table if not exists public.dominic_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_id uuid not null references public.dominic_inspections(id),
  asset_id uuid not null references public.dominic_assets(id),
  finding_type text not null,
  title text not null,
  description text,
  severity text not null default 'info'
    check (severity in ('info','low','medium','high','critical')),
  review_status text not null default 'detected'
    check (review_status in ('detected','needs_review','confirmed','dismissed')),
  confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  sensor_mode text,
  fingerprint text,
  latitude numeric,
  longitude numeric,
  spatial_anchor jsonb not null default '{}'::jsonb,
  measurement jsonb not null default '{}'::jsonb,
  detector jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_findings_inspection_idx
  on public.dominic_findings(inspection_id, observed_at desc);
create index if not exists dominic_findings_asset_idx
  on public.dominic_findings(asset_id, observed_at desc);
create index if not exists dominic_findings_user_review_idx
  on public.dominic_findings(user_id, review_status, severity, observed_at desc);
create index if not exists dominic_findings_fingerprint_idx
  on public.dominic_findings(user_id, asset_id, fingerprint)
  where fingerprint is not null;

drop trigger if exists dominic_findings_set_updated_at on public.dominic_findings;
create trigger dominic_findings_set_updated_at
  before update on public.dominic_findings
  for each row execute function public.set_updated_at();

create table if not exists public.dominic_finding_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  finding_id uuid not null references public.dominic_findings(id),
  evidence_type text not null,
  storage_path text,
  thumbnail_path text,
  source_table text,
  source_id uuid,
  mime_type text,
  captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dominic_finding_evidence_finding_idx
  on public.dominic_finding_evidence(finding_id, created_at);
create index if not exists dominic_finding_evidence_user_idx
  on public.dominic_finding_evidence(user_id, created_at desc);

create table if not exists public.dominic_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.dominic_assets(id),
  first_finding_id uuid references public.dominic_findings(id) on delete set null,
  current_finding_id uuid references public.dominic_findings(id) on delete set null,
  issue_type text not null,
  title text not null,
  description text,
  severity text not null default 'medium'
    check (severity in ('info','low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','monitoring','in_progress','resolved','verified','dismissed')),
  confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  verified_at timestamptz,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_issues_asset_status_idx
  on public.dominic_issues(asset_id, status, severity, last_seen_at desc);
create index if not exists dominic_issues_user_status_idx
  on public.dominic_issues(user_id, status, severity, updated_at desc);
create index if not exists dominic_issues_first_finding_idx
  on public.dominic_issues(first_finding_id)
  where first_finding_id is not null;
create index if not exists dominic_issues_current_finding_idx
  on public.dominic_issues(current_finding_id)
  where current_finding_id is not null;

drop trigger if exists dominic_issues_set_updated_at on public.dominic_issues;
create trigger dominic_issues_set_updated_at
  before update on public.dominic_issues
  for each row execute function public.set_updated_at();

create table if not exists public.dominic_issue_findings (
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_id uuid not null references public.dominic_issues(id),
  finding_id uuid not null references public.dominic_findings(id),
  inspection_id uuid not null references public.dominic_inspections(id),
  relation_type text not null default 'observation'
    check (relation_type in ('discovered','observation','progression','verification')),
  linked_at timestamptz not null default now(),
  primary key (issue_id, finding_id)
);

create index if not exists dominic_issue_findings_user_idx
  on public.dominic_issue_findings(user_id, linked_at desc);
create index if not exists dominic_issue_findings_inspection_idx
  on public.dominic_issue_findings(inspection_id, linked_at desc);
create index if not exists dominic_issue_findings_finding_idx
  on public.dominic_issue_findings(finding_id);

create table if not exists public.dominic_issue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_id uuid not null references public.dominic_issues(id),
  inspection_id uuid references public.dominic_inspections(id) on delete set null,
  finding_id uuid references public.dominic_findings(id) on delete set null,
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dominic_issue_events_issue_idx
  on public.dominic_issue_events(issue_id, created_at desc);
create index if not exists dominic_issue_events_user_idx
  on public.dominic_issue_events(user_id, created_at desc);
create index if not exists dominic_issue_events_inspection_idx
  on public.dominic_issue_events(inspection_id)
  where inspection_id is not null;
create index if not exists dominic_issue_events_finding_idx
  on public.dominic_issue_events(finding_id)
  where finding_id is not null;

alter table public.dominic_assets enable row level security;
alter table public.dominic_inspections enable row level security;
alter table public.dominic_findings enable row level security;
alter table public.dominic_finding_evidence enable row level security;
alter table public.dominic_issues enable row level security;
alter table public.dominic_issue_findings enable row level security;
alter table public.dominic_issue_events enable row level security;

grant select, insert, update, delete on table public.dominic_assets to authenticated;
grant select, insert, update on table public.dominic_inspections to authenticated;
grant select, insert, update on table public.dominic_findings to authenticated;
grant select, insert on table public.dominic_finding_evidence to authenticated;
grant select, insert, update on table public.dominic_issues to authenticated;
grant select, insert on table public.dominic_issue_findings to authenticated;
grant select, insert on table public.dominic_issue_events to authenticated;

grant all on table public.dominic_assets to service_role;
grant all on table public.dominic_inspections to service_role;
grant all on table public.dominic_findings to service_role;
grant all on table public.dominic_finding_evidence to service_role;
grant all on table public.dominic_issues to service_role;
grant all on table public.dominic_issue_findings to service_role;
grant all on table public.dominic_issue_events to service_role;

drop policy if exists "Users manage own DOMINIC assets" on public.dominic_assets;
create policy "Users manage own DOMINIC assets"
  on public.dominic_assets for all to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users read own DOMINIC inspections" on public.dominic_inspections;
create policy "Users read own DOMINIC inspections"
  on public.dominic_inspections for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create own DOMINIC inspections" on public.dominic_inspections;
create policy "Users create own DOMINIC inspections"
  on public.dominic_inspections for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_assets a
      where a.id = asset_id
        and (a.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users update own DOMINIC inspections" on public.dominic_inspections;
create policy "Users update own DOMINIC inspections"
  on public.dominic_inspections for update to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_assets a
      where a.id = asset_id
        and (a.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users read own DOMINIC findings" on public.dominic_findings;
create policy "Users read own DOMINIC findings"
  on public.dominic_findings for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create own DOMINIC findings" on public.dominic_findings;
create policy "Users create own DOMINIC findings"
  on public.dominic_findings for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_inspections i
      where i.id = inspection_id and i.asset_id = asset_id
        and (i.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users update own DOMINIC findings" on public.dominic_findings;
create policy "Users update own DOMINIC findings"
  on public.dominic_findings for update to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_inspections i
      where i.id = inspection_id and i.asset_id = asset_id
        and (i.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users read own DOMINIC finding evidence" on public.dominic_finding_evidence;
create policy "Users read own DOMINIC finding evidence"
  on public.dominic_finding_evidence for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create own DOMINIC finding evidence" on public.dominic_finding_evidence;
create policy "Users create own DOMINIC finding evidence"
  on public.dominic_finding_evidence for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_findings f
      where f.id = finding_id
        and (f.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users read own DOMINIC issues" on public.dominic_issues;
create policy "Users read own DOMINIC issues"
  on public.dominic_issues for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create own DOMINIC issues" on public.dominic_issues;
create policy "Users create own DOMINIC issues"
  on public.dominic_issues for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_assets a
      where a.id = asset_id
        and (a.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users update own DOMINIC issues" on public.dominic_issues;
create policy "Users update own DOMINIC issues"
  on public.dominic_issues for update to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_assets a
      where a.id = asset_id
        and (a.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users read own DOMINIC issue findings" on public.dominic_issue_findings;
create policy "Users read own DOMINIC issue findings"
  on public.dominic_issue_findings for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users link own DOMINIC issue findings" on public.dominic_issue_findings;
create policy "Users link own DOMINIC issue findings"
  on public.dominic_issue_findings for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_issues i
      where i.id = issue_id
        and (i.user_id = (select auth.uid()) or (select public.is_admin()))
    )
    and exists (
      select 1 from public.dominic_findings f
      where f.id = finding_id and f.inspection_id = inspection_id
        and (f.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Users read own DOMINIC issue events" on public.dominic_issue_events;
create policy "Users read own DOMINIC issue events"
  on public.dominic_issue_events for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create own DOMINIC issue events" on public.dominic_issue_events;
create policy "Users create own DOMINIC issue events"
  on public.dominic_issue_events for insert to authenticated
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1 from public.dominic_issues i
      where i.id = issue_id
        and (i.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
