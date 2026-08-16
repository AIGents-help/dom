alter table public.leads
  add column if not exists listing_color text;

alter table public.leads drop constraint if exists leads_listing_color_check;
alter table public.leads add constraint leads_listing_color_check
  check (listing_color is null or listing_color ~ '^#[0-9A-Fa-f]{6}$');

create unique index if not exists clients_lead_id_uidx
  on public.clients(lead_id) where lead_id is not null;

comment on column public.leads.listing_color is
  'Optional admin-selected hex color used to visually recognize this relationship in lead/client listings.';
