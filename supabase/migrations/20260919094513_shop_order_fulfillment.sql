-- Durable equipment orders and a service-role-only fulfillment boundary.
create table if not exists public.shop_inventory (
  product_key text primary key,
  product_name text not null,
  fulfillment_mode text not null default 'made_to_order'
    check (fulfillment_mode in ('stocked', 'made_to_order')),
  available_quantity integer check (available_quantity is null or available_quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  shipping_base_cents integer not null default 0 check (shipping_base_cents >= 0),
  shipping_additional_cents integer not null default 0 check (shipping_additional_cents >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (fulfillment_mode = 'made_to_order' or available_quantity is not null)
);

create table if not exists public.shop_orders (
  id uuid primary key,
  order_number text not null unique,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'new', 'processing', 'inventory_hold', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  customer_email text,
  customer_name text,
  customer_phone text,
  currency text not null default 'usd',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  shipping_name text,
  shipping_address jsonb,
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz
);

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  variant text,
  quantity integer not null check (quantity > 0),
  unit_amount_cents integer not null check (unit_amount_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists shop_orders_status_created_idx
  on public.shop_orders(status, created_at desc);
create unique index if not exists shop_orders_payment_intent_unique_idx
  on public.shop_orders(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists shop_order_items_order_idx
  on public.shop_order_items(order_id);

alter table public.shop_inventory enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
revoke all on public.shop_inventory, public.shop_orders, public.shop_order_items from public, anon, authenticated;
grant all on public.shop_inventory, public.shop_orders, public.shop_order_items to service_role;

insert into public.shop_inventory
  (product_key, product_name, fulfillment_mode, available_quantity, shipping_base_cents, shipping_additional_cents)
values
  ('drone-operation-safety-vest', 'Drone Operation Safety Vest', 'made_to_order', null, 695, 250),
  ('portable-landing-pad', 'Portable Drone Landing Pad', 'made_to_order', null, 995, 500),
  ('barrier-1', 'Drone Operation Retractable Barrier — Single', 'made_to_order', null, 2495, 1600),
  ('barrier-3', 'Drone Operation Barrier Kit — 3 Pack', 'made_to_order', null, 4995, 3500),
  ('barrier-4', 'Drone Operation Barrier Kit — 4 Pack', 'made_to_order', null, 5995, 4000),
  ('barrier-6', 'Drone Operation Barrier Kit — 6 Pack', 'made_to_order', null, 8495, 6000),
  ('barrier-12', 'Drone Operation Barrier Kit — 12 Pack', 'made_to_order', null, 14995, 10000),
  ('barrier-24', 'Drone Operation Corporate Barrier Kit — 24 Pack', 'made_to_order', null, 24995, 18000)
on conflict (product_key) do nothing;

create or replace function public.create_shop_checkout_service(
  p_order_id uuid,
  p_order_number text,
  p_session_id text,
  p_product_key text,
  p_product_name text,
  p_variant text,
  p_quantity integer,
  p_unit_amount_cents integer,
  p_shipping_cents integer
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_quantity < 1 or p_quantity > 20 or p_unit_amount_cents < 0 or p_shipping_cents < 0 then
    raise exception 'Invalid shop checkout values';
  end if;

  insert into public.shop_orders (
    id, order_number, stripe_checkout_session_id, subtotal_cents, shipping_cents, total_cents
  ) values (
    p_order_id, p_order_number, p_session_id,
    p_quantity * p_unit_amount_cents, p_shipping_cents,
    (p_quantity * p_unit_amount_cents) + p_shipping_cents
  );

  insert into public.shop_order_items (
    order_id, product_key, product_name, variant, quantity, unit_amount_cents, line_total_cents
  ) values (
    p_order_id, p_product_key, p_product_name, nullif(p_variant, ''), p_quantity,
    p_unit_amount_cents, p_quantity * p_unit_amount_cents
  );
  return p_order_id;
end;
$$;

create or replace function public.complete_shop_order_service(
  p_session_id text,
  p_payment_intent_id text,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_currency text,
  p_subtotal_cents integer,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_discount_cents integer,
  p_total_cents integer,
  p_shipping_name text,
  p_shipping_address jsonb
) returns table(order_id uuid, order_number text, order_status text, newly_paid boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_item public.shop_order_items%rowtype;
  v_inventory public.shop_inventory%rowtype;
  v_status text := 'new';
begin
  select * into v_order from public.shop_orders
    where stripe_checkout_session_id = p_session_id for update;
  if not found then raise exception 'Shop order not found'; end if;

  if v_order.payment_status = 'paid' then
    return query select v_order.id, v_order.order_number, v_order.status, false;
    return;
  end if;

  select * into v_item from public.shop_order_items where shop_order_items.order_id = v_order.id limit 1;
  select * into v_inventory from public.shop_inventory where product_key = v_item.product_key for update;

  if v_inventory.fulfillment_mode = 'stocked' then
    if v_inventory.available_quantity < v_item.quantity then
      v_status := 'inventory_hold';
    else
      update public.shop_inventory
        set available_quantity = available_quantity - v_item.quantity, updated_at = now()
        where product_key = v_item.product_key;
    end if;
  end if;

  update public.shop_orders set
    stripe_payment_intent_id = p_payment_intent_id,
    status = v_status,
    payment_status = 'paid',
    customer_email = p_customer_email,
    customer_name = p_customer_name,
    customer_phone = p_customer_phone,
    currency = lower(coalesce(p_currency, 'usd')),
    subtotal_cents = greatest(coalesce(p_subtotal_cents, 0), 0),
    shipping_cents = greatest(coalesce(p_shipping_cents, 0), 0),
    tax_cents = greatest(coalesce(p_tax_cents, 0), 0),
    discount_cents = greatest(coalesce(p_discount_cents, 0), 0),
    total_cents = greatest(coalesce(p_total_cents, 0), 0),
    shipping_name = p_shipping_name,
    shipping_address = p_shipping_address,
    paid_at = now(), updated_at = now()
  where id = v_order.id;

  return query select v_order.id, v_order.order_number, v_status, true;
end;
$$;

create or replace function public.refund_shop_order_service(p_order_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_item public.shop_order_items%rowtype;
begin
  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'Shop order not found'; end if;
  if v_order.payment_status = 'refunded' then return false; end if;
  if v_order.payment_status <> 'paid' or v_order.status in ('shipped', 'delivered') then
    raise exception 'Shop order is not refundable';
  end if;

  for v_item in select * from public.shop_order_items where order_id = p_order_id loop
    update public.shop_inventory
      set available_quantity = available_quantity + v_item.quantity, updated_at = now()
      where product_key = v_item.product_key and fulfillment_mode = 'stocked';
  end loop;

  update public.shop_orders set
    status = 'refunded', payment_status = 'refunded', refunded_at = now(), updated_at = now()
    where id = p_order_id;
  return true;
end;
$$;

revoke all on function public.create_shop_checkout_service(uuid,text,text,text,text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.complete_shop_order_service(text,text,text,text,text,text,integer,integer,integer,integer,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.refund_shop_order_service(uuid) from public, anon, authenticated;
grant execute on function public.create_shop_checkout_service(uuid,text,text,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.complete_shop_order_service(text,text,text,text,text,text,integer,integer,integer,integer,integer,text,jsonb) to service_role;
grant execute on function public.refund_shop_order_service(uuid) to service_role;

alter type public.email_notification_type add value if not exists 'shop_order_confirmation';
alter type public.email_notification_type add value if not exists 'shop_order_shipped';
alter type public.email_notification_type add value if not exists 'shop_order_refunded';
alter type public.email_notification_type add value if not exists 'admin_shop_order';
