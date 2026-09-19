-- Reserve stocked inventory atomically when checkout is created so parallel
-- Stripe sessions cannot oversell the same units.
create or replace function public.create_shop_checkout_service(
  p_order_id uuid, p_order_number text, p_session_id text, p_product_key text,
  p_product_name text, p_variant text, p_quantity integer,
  p_unit_amount_cents integer, p_shipping_cents integer
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_inventory public.shop_inventory%rowtype;
begin
  if p_quantity < 1 or p_quantity > 20 or p_unit_amount_cents < 0 or p_shipping_cents < 0 then raise exception 'Invalid shop checkout values'; end if;
  select * into v_inventory from public.shop_inventory where product_key = p_product_key for update;
  if not found or not v_inventory.active then raise exception 'This product is not currently available'; end if;
  if v_inventory.fulfillment_mode = 'stocked' then
    if coalesce(v_inventory.available_quantity, 0) < p_quantity then raise exception 'The requested quantity is not currently in stock'; end if;
    update public.shop_inventory set available_quantity = available_quantity - p_quantity, updated_at = now() where product_key = p_product_key;
  end if;
  insert into public.shop_orders (id,order_number,stripe_checkout_session_id,subtotal_cents,shipping_cents,total_cents)
    values (p_order_id,p_order_number,p_session_id,p_quantity*p_unit_amount_cents,p_shipping_cents,(p_quantity*p_unit_amount_cents)+p_shipping_cents);
  insert into public.shop_order_items (order_id,product_key,product_name,variant,quantity,unit_amount_cents,line_total_cents)
    values (p_order_id,p_product_key,p_product_name,nullif(p_variant,''),p_quantity,p_unit_amount_cents,p_quantity*p_unit_amount_cents);
  return p_order_id;
end; $$;

create or replace function public.complete_shop_order_service(
  p_session_id text,p_payment_intent_id text,p_customer_email text,p_customer_name text,p_customer_phone text,p_currency text,
  p_subtotal_cents integer,p_shipping_cents integer,p_tax_cents integer,p_discount_cents integer,p_total_cents integer,p_shipping_name text,p_shipping_address jsonb
) returns table(order_id uuid,order_number text,order_status text,newly_paid boolean)
language plpgsql security invoker set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  select * into v_order from public.shop_orders where stripe_checkout_session_id=p_session_id for update;
  if not found then raise exception 'Shop order not found'; end if;
  if v_order.payment_status='paid' then return query select v_order.id,v_order.order_number,v_order.status,false; return; end if;
  update public.shop_orders set stripe_payment_intent_id=p_payment_intent_id,status='new',payment_status='paid',
    customer_email=p_customer_email,customer_name=p_customer_name,customer_phone=p_customer_phone,currency=lower(coalesce(p_currency,'usd')),
    subtotal_cents=greatest(coalesce(p_subtotal_cents,0),0),shipping_cents=greatest(coalesce(p_shipping_cents,0),0),
    tax_cents=greatest(coalesce(p_tax_cents,0),0),discount_cents=greatest(coalesce(p_discount_cents,0),0),
    total_cents=greatest(coalesce(p_total_cents,0),0),shipping_name=p_shipping_name,shipping_address=p_shipping_address,paid_at=now(),updated_at=now()
    where id=v_order.id;
  return query select v_order.id,v_order.order_number,'new'::text,true;
end; $$;

revoke all on function public.create_shop_checkout_service(uuid,text,text,text,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_shop_order_service(text,text,text,text,text,text,integer,integer,integer,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_shop_checkout_service(uuid,text,text,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.complete_shop_order_service(text,text,text,text,text,text,integer,integer,integer,integer,integer,text,jsonb) to service_role;


create or replace function public.release_shop_checkout_service(
  p_session_id text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_item public.shop_order_items%rowtype;
begin
  select * into v_order
  from public.shop_orders
  where stripe_checkout_session_id = p_session_id
  for update;

  if not found then return false; end if;
  if v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment' then return false; end if;

  for v_item in select * from public.shop_order_items where order_id = v_order.id loop
    update public.shop_inventory
      set available_quantity = available_quantity + v_item.quantity,
          updated_at = now()
      where product_key = v_item.product_key
        and fulfillment_mode = 'stocked';
  end loop;

  update public.shop_orders
    set status = 'cancelled',
        payment_status = 'failed',
        cancelled_at = now(),
        updated_at = now()
    where id = v_order.id;

  return true;
end;
$$;

revoke all on function public.release_shop_checkout_service(text) from public, anon, authenticated;
grant execute on function public.release_shop_checkout_service(text) to service_role;
