alter table public.dominic_inspection_media
  add column if not exists source_capture_id text,
  add column if not exists source_aircraft_id text;

create unique index if not exists dominic_inspection_media_source_capture_uidx
  on public.dominic_inspection_media(user_id, source_capture_id)
  where source_capture_id is not null;
