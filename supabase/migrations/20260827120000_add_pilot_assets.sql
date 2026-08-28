-- Issue #15: pilot asset inventory, equipment-based mission eligibility,
-- admin pilot search. Purely additive — `contractors.equipment` (free
-- text) is untouched and stays the backward-compatible summary field; this
-- adds a normalized, structured layer alongside it. Four new tables, no
-- existing table altered, no DROPs.
--
-- RLS mirrors the real, live pattern already used by the mapper tables
-- (see supabase/migrations/20260807000900_add_dom_mapper_tables.sql):
-- `is_admin()` for admin-full-access, `exists (select 1 from contractors c
-- where c.id = <fk> and c.user_id = auth.uid())` for contractor-scoped
-- access, joined through the parent for child tables.

-- ---------------------------------------------------------------------------
-- pilot_assets — structured equipment records. asset_type/status/capability
-- keys are unconstrained text with the app-level source of truth in
-- lib/pilotAssetsPipeline.ts (same "no DB constraint, app array is
-- authoritative" convention already used for deliverables.type — see
-- MAPPER_DELIVERABLE_TYPES in lib/mapperPipeline.ts), so new asset/
-- capability types never need a migration to add.
-- ---------------------------------------------------------------------------

create table public.pilot_assets (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  asset_type text not null,
  manufacturer text,
  model text,
  display_name text,
  serial_number text,
  registration_number text,
  remote_id text,
  firmware_version text,
  acquired_at date,
  status text not null default 'active',
  public_visible boolean not null default false,
  public_description text,
  notes text,
  metadata jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pilot_assets is
  'Structured pilot equipment (UAV, payload, RTK/GNSS, batteries, vehicles, etc.), superseding contractors.equipment (kept, unchanged, as a free-text backward-compat summary). serial_number/registration_number/remote_id/firmware_version/acquired_at/notes are PRIVATE — visible only to the owning pilot and admins, never on a public profile regardless of public_visible.';
comment on column public.pilot_assets.public_visible is
  'Pilot-controlled opt-in. When true, display_name/manufacturer/model/public_description/status/capabilities may appear on the pilot''s public profile (see app/pilots/[slug]/page.tsx) -- private fields never do, even then.';
comment on column public.pilot_assets.archived_at is
  'Set when a pilot archives (soft-hides) an asset without deleting it -- distinct from status=retired, which describes the equipment''s real-world state. Archived assets are excluded from active-capability eligibility matching and from the default asset manager list.';

create index idx_pilot_assets_contractor_id on public.pilot_assets (contractor_id);

create trigger pilot_assets_set_updated_at
  before update on public.pilot_assets
  for each row execute function public.set_updated_at();

alter table public.pilot_assets enable row level security;

create policy "admins full access" on public.pilot_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own assets" on public.pilot_assets
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.contractors c where c.id = pilot_assets.contractor_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.contractors c where c.id = pilot_assets.contractor_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- pilot_asset_capabilities — capability tags unlocked by an asset (an asset
-- can carry more than one, e.g. an RTK-equipped mapping drone gets both
-- 'mapping_photogrammetry' and 'rtk'). Kept as its own table rather than an
-- array column on pilot_assets so eligibility matching can index/join on it
-- directly instead of unnesting an array on every query.
-- ---------------------------------------------------------------------------

create table public.pilot_asset_capabilities (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.pilot_assets (id) on delete cascade,
  capability text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, capability)
);

create index idx_pilot_asset_capabilities_asset_id on public.pilot_asset_capabilities (asset_id);
create index idx_pilot_asset_capabilities_capability on public.pilot_asset_capabilities (capability);

alter table public.pilot_asset_capabilities enable row level security;

create policy "admins full access" on public.pilot_asset_capabilities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own asset capabilities" on public.pilot_asset_capabilities
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.pilot_assets pa
      join public.contractors c on c.id = pa.contractor_id
      where pa.id = pilot_asset_capabilities.asset_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.pilot_assets pa
      join public.contractors c on c.id = pa.contractor_id
      where pa.id = pilot_asset_capabilities.asset_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mission_capability_requirements — data-driven mission/service-type
-- capability requirements (see item 3/4 of issue #15: "data-driven and
-- extensible rather than hard-coded only in UI components"). Keyed by
-- service_type, matching the existing SERVICE_BASE_PRICES vocabulary in
-- lib/quoting.ts (mission_requests.service_type / jobs.service_type) --
-- not the coarser SOP-grouping mission_type used elsewhere. Admin-managed
-- config, non-sensitive, readable by any authenticated user (pilots need it
-- client-side to explain queue eligibility; real enforcement is always
-- server-side regardless -- see app/api/pilot/queue/[id]/claim/route.ts).
-- ---------------------------------------------------------------------------

create table public.mission_capability_requirements (
  id uuid primary key default gen_random_uuid(),
  service_type text not null,
  capability text not null,
  required boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type, capability)
);

create trigger mission_capability_requirements_set_updated_at
  before update on public.mission_capability_requirements
  for each row execute function public.set_updated_at();

alter table public.mission_capability_requirements enable row level security;

create policy "admins manage requirements" on public.mission_capability_requirements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read requirements" on public.mission_capability_requirements
  for select to authenticated using (true);

-- Seed from the issue's own worked examples. Purely a starting point --
-- admins can add/edit/remove rows going forward; nothing in the app
-- hard-codes these.
insert into public.mission_capability_requirements (service_type, capability, required) values
  ('roof_inspection_residential', 'rgb_imagery', true),
  ('roof_inspection_commercial', 'rgb_imagery', true),
  ('roof_inspection_commercial', 'zoom_inspection', false),
  ('construction_progress', 'mapping_photogrammetry', true),
  ('thermal_inspection', 'thermal', true),
  ('ortho_survey', 'mapping_photogrammetry', true),
  ('ortho_survey', 'rtk', false),
  ('powerline_inspection', 'zoom_inspection', true),
  ('powerline_inspection', 'obstacle_avoidance', false),
  ('real_estate_media', 'video', true)
on conflict (service_type, capability) do nothing;

-- ---------------------------------------------------------------------------
-- mission_asset_assignments — which specific asset(s) a pilot is using for
-- an assigned mission (issue #15 item 5). asset_id is nullable with
-- on delete set null so a historical assignment record survives even if
-- the pilot later deletes the asset row -- consistent with this repo's
-- "don't lose history" convention elsewhere (e.g. deliverables rows
-- outliving a reprocessed job). There is no pre-existing `assigned_uav`
-- column anywhere in this schema to bridge to (verified — none exists), so
-- this table is the whole of the structured-assignment feature, not a
-- migration off an older field.
-- ---------------------------------------------------------------------------

create table public.mission_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_assignment_id uuid not null references public.mission_assignments (id) on delete cascade,
  asset_id uuid references public.pilot_assets (id) on delete set null,
  role text not null default 'aircraft',
  created_at timestamptz not null default now()
);

create index idx_mission_asset_assignments_mission_assignment_id on public.mission_asset_assignments (mission_assignment_id);
create index idx_mission_asset_assignments_asset_id on public.mission_asset_assignments (asset_id);

alter table public.mission_asset_assignments enable row level security;

create policy "admins full access" on public.mission_asset_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "contractor manages own mission asset assignments" on public.mission_asset_assignments
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_asset_assignments.mission_assignment_id and c.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.mission_assignments ma
      join public.contractors c on c.id = ma.contractor_id
      where ma.id = mission_asset_assignments.mission_assignment_id and c.user_id = auth.uid()
    )
  );

-- Rollback note (fully reversible, no data loss to any pre-existing table):
--   drop table if exists public.mission_asset_assignments;
--   drop table if exists public.mission_capability_requirements;
--   drop table if exists public.pilot_asset_capabilities;
--   drop table if exists public.pilot_assets;
