import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ShopProduct = {
  product_key: string;
  product_name: string;
  description: string;
  unit_amount_cents: number;
  variants: string[];
  category: string;
  image_url: string | null;
  fulfillment_mode: string;
  available_quantity: number | null;
  active: boolean;
};

export async function getShopProduct(productKey: string): Promise<ShopProduct | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("shop_inventory")
    .select("product_key,product_name,description,unit_amount_cents,variants,category,image_url,fulfillment_mode,available_quantity,active")
    .eq("product_key", productKey)
    .maybeSingle();
  if (error) throw new Error(`Could not load product ${productKey}: ${error.message}`);
  return data as ShopProduct | null;
}

export async function getActiveShopProducts(): Promise<ShopProduct[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("shop_inventory")
    .select("product_key,product_name,description,unit_amount_cents,variants,category,image_url,fulfillment_mode,available_quantity,active")
    .eq("active", true)
    .order("sort_order")
    .order("product_name");
  if (error) throw new Error(`Could not load shop catalog: ${error.message}`);
  return (data ?? []) as ShopProduct[];
}

export function formatProductPrice(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
