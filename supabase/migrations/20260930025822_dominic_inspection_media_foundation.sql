create table if not exists public.dominic_inspection_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_id uuid not null references public.dominic_inspections(id) on delete cascade,
  asset_id uuid not null references public.dominic_assets(id) on delete cascade,
  sensor_mode text not null,
  media_type text not null default 'image'
    check (media_type in ('image','thermal_matrix','video','document','telemetry')),
  storage_path text,
  original_filename text,
  mime_type text,
  captured_at timestamptz,
  latitude numeric,
  longitude numeric,
  relative_altitude_ft numeric,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending','analyzing','review','complete','failed')),
  analysis_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dominic_inspection_media_user_path_uidx
  on public.dominic_inspection_media(user_id, storage_path)
  where storage_path is not null;
create index if not exists dominic_inspection_media_inspection_idx
  on public.dominic_inspection_media(inspection_id, created_at desc);
create index if not exists dominic_inspection_media_asset_idx
  on public.dominic_inspection_media(asset_id, captured_at desc);
create index if not exists dominic_inspection_media_analysis_idx
  on public.dominic_inspection_media(user_id, analysis_status, created_at desc);

drop trigger if exists dominic_inspection_media_set_updated_at on public.dominic_inspection_media;
create trigger dominic_inspection_media_set_updated_at
  before update on public.dominic_inspection_media
  for each row execute function public.set_updated_at();

alter table public.dominic_inspection_media enable row level security;

grant select, insert, update, delete on table public.dominic_inspection_media to authenticated;
grant all on table public.dominic_inspection_media to service_role;

drop policy if exists "Users manage own DOMINIC inspection media" on public.dominic_inspection_media;
create policy "Users manage own DOMINIC inspection media"
  on public.dominic_inspection_media for all
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check (
    ((select auth.uid()) = user_id or (select public.is_admin()))
    and exists (
      select 1
      from public.dominic_inspections i
      where i.id = inspection_id
        and i.asset_id = asset_id
        and (i.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
