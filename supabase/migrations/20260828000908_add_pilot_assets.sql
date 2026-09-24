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
  'Structured pilot equipment (UAV, payload, RTK/GNSS, batteries, vehicles, etc.), superseding contractors.equipment (kept, unchanged, as a free-text backward-compat summary). serial_number/registration_number/remote_id/firmware_version/acquired_at/notes are PRIVATE.';
comment on column public.pilot_assets.public_visible is
  'Pilot-controlled opt-in. When true, display_name/manufacturer/model/public_description/status/capabilities may appear on the pilot''s public profile -- private fields never do, even then.';
comment on column public.pilot_assets.archived_at is
  'Set when a pilot archives (soft-hides) an asset without deleting it. Archived assets are excluded from active-capability eligibility matching and from the default asset manager list.';

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
