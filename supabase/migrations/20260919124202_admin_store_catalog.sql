-- Expand the private fulfillment inventory into the authoritative shop catalog.
alter table public.shop_inventory
  add column if not exists description text not null default '',
  add column if not exists unit_amount_cents integer not null default 0 check (unit_amount_cents >= 0),
  add column if not exists variants text[] not null default '{}',
  add column if not exists category text not null default 'Equipment',
  add column if not exists image_url text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

update public.shop_inventory set
  description = case product_key
    when 'drone-operation-safety-vest' then 'Orange high-visibility safety vest with reflective striping and DRONE OPERATION identification.'
    when 'portable-landing-pad' then 'High-visibility foldable landing pad for drone takeoffs and landings.'
    when 'barrier-1' then 'One high-visibility retractable barrier post with 6 ft DRONE OPERATION webbing.'
    when 'barrier-3' then 'Three high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.'
    when 'barrier-4' then 'Four high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.'
    when 'barrier-6' then 'Six high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.'
    when 'barrier-12' then 'Twelve high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.'
    when 'barrier-24' then 'Twenty-four high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.'
    else description end,
  unit_amount_cents = case product_key
    when 'drone-operation-safety-vest' then 1500 when 'portable-landing-pad' then 1500
    when 'barrier-1' then 6900 when 'barrier-3' then 17900 when 'barrier-4' then 22900
    when 'barrier-6' then 31900 when 'barrier-12' then 59900 when 'barrier-24' then 109900
    else unit_amount_cents end,
  variants = case when product_key = 'drone-operation-safety-vest' then array['S','M','L','XL']::text[] else variants end,
  image_url = case product_key
    when 'drone-operation-safety-vest' then '/shop/safety/drone-operation-vest-front.jpeg'
    when 'portable-landing-pad' then '/shop/safety/portable-landing-pad.jpeg'
    else image_url end,
  fulfillment_mode = case
    when product_key in ('drone-operation-safety-vest','portable-landing-pad','barrier-1','barrier-3','barrier-4','barrier-6','barrier-12','barrier-24') then 'stocked'
    else fulfillment_mode end,
  available_quantity = case
    when product_key in ('drone-operation-safety-vest','portable-landing-pad','barrier-1','barrier-3','barrier-4','barrier-6','barrier-12','barrier-24') then coalesce(available_quantity, 0)
    else available_quantity end;

create index if not exists shop_inventory_catalog_sort_idx
  on public.shop_inventory(active desc, sort_order, product_name);

-- Keep the catalog private. Public reads go through a deliberately narrow server route.
revoke all on public.shop_inventory from public, anon, authenticated;
grant all on public.shop_inventory to service_role;
