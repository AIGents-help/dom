import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const cents = (value: unknown) => Number(value);
const quantity = (value: unknown) => Number(value);

export async function GET(req: NextRequest) {
  const admin = await isAdminRequest(req);
  let query = getSupabaseAdmin().from("shop_inventory").select("*").order("sort_order").order("product_name");
  if (!admin) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { products: data ?? [], access: admin ? "admin" : "catalog" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const productKey = clean(body.productKey, 80).toLowerCase();
  const productName = clean(body.productName, 160);
  const unitAmount = cents(body.unitAmountCents);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productKey) || !productName || !Number.isInteger(unitAmount) || unitAmount < 0) {
    return NextResponse.json({ error: "Product key, name, and a valid price are required." }, { status: 400 });
  }
  const availableQuantity = quantity(body.availableQuantity);
  if (body.fulfillmentMode === "stocked" && (!Number.isInteger(availableQuantity) || availableQuantity < 0)) return NextResponse.json({ error: "Available quantity must be a whole number of 0 or more." }, { status: 400 });
  const variants = Array.isArray(body.variants) ? body.variants.map((item) => clean(item, 40)).filter(Boolean).slice(0, 30) : [];
  const { data: saved, error } = await getSupabaseAdmin().from("shop_inventory").insert({
    product_key: productKey, product_name: productName, description: clean(body.description, 2000),
    unit_amount_cents: unitAmount, variants, category: clean(body.category, 80) || "Equipment",
    image_url: clean(body.imageUrl, 1000) || null, active: body.active !== false,
    fulfillment_mode: body.fulfillmentMode === "stocked" ? "stocked" : "made_to_order",
    available_quantity: body.fulfillmentMode === "stocked" ? availableQuantity : null,
    shipping_base_cents: Math.max(0, cents(body.shippingBaseCents) || 0),
    shipping_additional_cents: Math.max(0, cents(body.shippingAdditionalCents) || 0), updated_at: new Date().toISOString(),
  }).select("*").single();
  return error ? NextResponse.json({ error: error.code === "23505" ? "That product key already exists." : error.message }, { status: 409 }) : NextResponse.json({ success: true, product: saved });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const productKey = clean(body?.productKey, 80);
  const productName = clean(body?.productName, 160);
  const unitAmount = cents(body?.unitAmountCents);
  if (!productKey || !productName || !Number.isInteger(unitAmount) || unitAmount < 0) {
    return NextResponse.json({ error: "Name and a valid price are required." }, { status: 400 });
  }

  const availableQuantity = quantity(body?.availableQuantity);
  const stocked = body?.fulfillmentMode === "stocked";
  if (stocked && (!Number.isInteger(availableQuantity) || availableQuantity < 0)) {
    return NextResponse.json({ error: "Available quantity must be a whole number of 0 or more." }, { status: 400 });
  }

  const variants = Array.isArray(body?.variants) ? body.variants.map((item) => clean(item, 40)).filter(Boolean).slice(0, 30) : [];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("admin_update_shop_product_service", {
    p_product_key: productKey,
    p_product_name: productName,
    p_description: clean(body?.description, 2000),
    p_unit_amount_cents: unitAmount,
    p_variants: variants,
    p_category: clean(body?.category, 80) || "Equipment",
    p_image_url: clean(body?.imageUrl, 1000),
    p_fulfillment_mode: stocked ? "stocked" : "made_to_order",
    p_available_quantity: stocked ? availableQuantity : null,
    p_shipping_base_cents: Math.max(0, cents(body?.shippingBaseCents) || 0),
    p_shipping_additional_cents: Math.max(0, cents(body?.shippingAdditionalCents) || 0),
    p_active: body?.active === true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved || saved.product_key !== productKey) {
    return NextResponse.json({ error: "Product save could not be verified." }, { status: 500 });
  }
  if (stocked && saved.available_quantity !== availableQuantity) {
    return NextResponse.json({ error: "Stock quantity did not persist. No success response was returned." }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, product: saved, persistedQuantity: saved.available_quantity },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
