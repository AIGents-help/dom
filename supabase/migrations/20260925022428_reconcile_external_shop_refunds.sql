-- Reconcile Stripe refunds even when they are initiated outside the DOM
-- Admin UI. Unshipped stocked merchandise is returned to available inventory;
-- shipped/delivered merchandise is marked refunded without automatic restock.

create or replace function public.reconcile_shop_refund_service(
  p_payment_intent_id text
) returns table(order_id uuid, order_number text, restocked boolean, newly_refunded boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_item public.shop_order_items%rowtype;
  v_restock boolean := false;
begin
  select * into v_order
  from public.shop_orders
  where stripe_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    return;
  end if;

  if v_order.payment_status = 'refunded' then
    return query select v_order.id, v_order.order_number, false, false;
    return;
  end if;

  if v_order.payment_status <> 'paid' then
    return query select v_order.id, v_order.order_number, false, false;
    return;
  end if;

  v_restock := v_order.status not in ('shipped', 'delivered');

  if v_restock then
    for v_item in
      select * from public.shop_order_items where shop_order_items.order_id = v_order.id
    loop
      update public.shop_inventory
        set available_quantity = available_quantity + v_item.quantity,
            updated_at = now()
        where product_key = v_item.product_key
          and fulfillment_mode = 'stocked';
    end loop;
  end if;

  update public.shop_orders
    set status = 'refunded',
        payment_status = 'refunded',
        refunded_at = coalesce(refunded_at, now()),
        updated_at = now()
    where id = v_order.id;

  return query select v_order.id, v_order.order_number, v_restock, true;
end;
$$;

revoke all on function public.reconcile_shop_refund_service(text)
  from public, anon, authenticated;
grant execute on function public.reconcile_shop_refund_service(text)
  to service_role;
