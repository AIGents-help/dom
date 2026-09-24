-- Single authoritative write path for Admin product edits.
-- Service role only; returns the exact persisted row so the UI can verify inventory.
create or replace function public.admin_update_shop_product_service(
  p_product_key text,
  p_product_name text,
  p_description text,
  p_unit_amount_cents integer,
  p_variants text[],
  p_category text,
  p_image_url text,
  p_fulfillment_mode text,
  p_available_quantity integer,
  p_shipping_base_cents integer,
  p_shipping_additional_cents integer,
  p_active boolean
) returns public.shop_inventory
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved public.shop_inventory%rowtype;
begin
  if p_product_key is null or btrim(p_product_key) = '' then raise exception 'Product key is required'; end if;
  if p_product_name is null or btrim(p_product_name) = '' then raise exception 'Product name is required'; end if;
  if p_unit_amount_cents < 0 then raise exception 'Price cannot be negative'; end if;
  if p_fulfillment_mode not in ('stocked','made_to_order') then raise exception 'Invalid fulfillment mode'; end if;
  if p_fulfillment_mode = 'stocked' and (p_available_quantity is null or p_available_quantity < 0) then raise exception 'Stock quantity must be zero or greater'; end if;

  update public.shop_inventory
  set product_name = btrim(p_product_name),
      description = coalesce(p_description, ''),
      unit_amount_cents = p_unit_amount_cents,
      variants = coalesce(p_variants, '{}'::text[]),
      category = coalesce(nullif(btrim(p_category), ''), 'Equipment'),
      image_url = nullif(btrim(coalesce(p_image_url, '')), ''),
      fulfillment_mode = p_fulfillment_mode,
      available_quantity = case when p_fulfillment_mode = 'stocked' then p_available_quantity else null end,
      shipping_base_cents = greatest(coalesce(p_shipping_base_cents, 0), 0),
      shipping_additional_cents = greatest(coalesce(p_shipping_additional_cents, 0), 0),
      active = coalesce(p_active, false),
      updated_at = now()
  where product_key = p_product_key
  returning * into v_saved;

  if not found then raise exception 'Product not found'; end if;
  return v_saved;
end;
$$;

revoke all on function public.admin_update_shop_product_service(text,text,text,integer,text[],text,text,text,integer,integer,integer,boolean) from public, anon, authenticated;
grant execute on function public.admin_update_shop_product_service(text,text,text,integer,text[],text,text,text,integer,integer,integer,boolean) to service_role;
