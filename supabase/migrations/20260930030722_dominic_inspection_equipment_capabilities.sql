alter table public.dominic_inspections
  add column if not exists required_capabilities text[] not null default '{}'::text[],
  add column if not exists optional_capabilities text[] not null default '{}'::text[],
  add column if not exists capability_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.dominic_inspection_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_id uuid not null references public.dominic_inspections(id) on delete cascade,
  pilot_asset_id uuid not null references public.pilot_assets(id) on delete cascade,
  role text not null default 'aircraft'
    check (role in ('aircraft','payload','sensor','support')),
  capabilities_snapshot jsonb not null default '{}'::jsonb,
  selected_at timestamptz not null default now(),
  unique (inspection_id, pilot_asset_id, role)
);

create index if not exists dominic_inspection_equipment_inspection_idx
  on public.dominic_inspection_equipment(inspection_id, selected_at);
create index if not exists dominic_inspection_equipment_asset_idx
  on public.dominic_inspection_equipment(pilot_asset_id);
create index if not exists dominic_inspection_equipment_user_idx
  on public.dominic_inspection_equipment(user_id, selected_at desc);

alter table public.dominic_inspection_equipment enable row level security;

grant select, insert, update, delete on table public.dominic_inspection_equipment to authenticated;
grant all on table public.dominic_inspection_equipment to service_role;

drop policy if exists "Users manage own DOMINIC inspection equipment" on public.dominic_inspection_equipment;
create policy "Users manage own DOMINIC inspection equipment"
  on public.dominic_inspection_equipment for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_admin())
  )
  with check (
    (
      (select auth.uid()) = user_id
      or (select public.is_admin())
    )
    and exists (
      select 1
      from public.dominic_inspections i
      where i.id = inspection_id
        and (
          i.user_id = (select auth.uid())
          or (select public.is_admin())
        )
    )
    and exists (
      select 1
      from public.pilot_assets pa
      join public.contractors c on c.id = pa.contractor_id
      where pa.id = pilot_asset_id
        and (
          c.user_id = (select auth.uid())
          or (select public.is_admin())
        )
    )
  );
