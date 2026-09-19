import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await getSupabaseAdmin().from("shop_inventory")
    .select("product_key,product_name,description,unit_amount_cents,variants,category,image_url,fulfillment_mode,available_quantity")
    .eq("active", true).order("sort_order").order("product_name");
  if (error) return NextResponse.json({ error: "Products could not be loaded." }, { status: 500 });
  return NextResponse.json({ products: data ?? [] });
}
