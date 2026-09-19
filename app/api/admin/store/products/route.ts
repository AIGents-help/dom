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
  const availableQuantity = quantity(body.availableQuantity);\n  if (body.fulfillmentMode === "stocked" && (!Number.isInteger(availableQuantity) || availableQuantity < 0)) return NextResponse.json({ error: "Available quantity must be a whole number of 0 or more." }, { status: 400 });\n  const variants = Array.isArray(body.variants) ? body.variants.map((item) => clean(item, 40)).filter(Boolean).slice(0, 30) : [];
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
  if (!productKey || !productName || !Number.isInteger(unitAmount) || unitAmount < 0) return NextResponse.json({ error: "Name and a valid price are required." }, { status: 400 });
  const availableQuantity = quantity(body?.availableQuantity);\n  if (body?.fulfillmentMode === "stocked" && (!Number.isInteger(availableQuantity) || availableQuantity < 0)) return NextResponse.json({ error: "Available quantity must be a whole number of 0 or more." }, { status: 400 });\n  const variants = Array.isArray(body?.variants) ? body.variants.map((item) => clean(item, 40)).filter(Boolean).slice(0, 30) : [];
  const stocked = body?.fulfillmentMode === "stocked";
  const { data: saved, error } = await getSupabaseAdmin().from("shop_inventory").update({
    product_name: productName, description: clean(body?.description, 2000), unit_amount_cents: unitAmount,
    variants, category: clean(body?.category, 80) || "Equipment", image_url: clean(body?.imageUrl, 1000) || null,
    active: body?.active === true, fulfillment_mode: stocked ? "stocked" : "made_to_order",
    available_quantity: stocked ? availableQuantity : null,
    shipping_base_cents: Math.max(0, cents(body?.shippingBaseCents) || 0),
    shipping_additional_cents: Math.max(0, cents(body?.shippingAdditionalCents) || 0), updated_at: new Date().toISOString(),
  }).eq("product_key", productKey).select("*").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true, product: saved });
}
