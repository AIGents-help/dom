import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateShipping } from "@/lib/shop/catalog";

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const input = body as { productKey?: unknown; quantity?: unknown; size?: unknown };
    const productKey = typeof input.productKey === "string" ? input.productKey : "";
    const quantity = Number(input.quantity ?? 1);
    if (!productKey) return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return NextResponse.json({ error: "Quantity must be between 1 and 20" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    const { data: inventory, error: inventoryError } = await admin
      .from("shop_inventory")
      .select("product_key,product_name,description,unit_amount_cents,variants,active,fulfillment_mode,available_quantity,shipping_base_cents,shipping_additional_cents")
      .eq("product_key", productKey)
      .maybeSingle();
    if (inventoryError || !inventory?.active) {
      return NextResponse.json({ error: "This product is not currently available" }, { status: 409 });
    }
    if (inventory.fulfillment_mode === "stocked" && (inventory.available_quantity ?? 0) < quantity) {
      return NextResponse.json({ error: "The requested quantity is not currently in stock" }, { status: 409 });
    }
    const requestedVariant = typeof input.size === "string" ? input.size.trim() : "";
    const variants = Array.isArray(inventory.variants) ? inventory.variants : [];
    const variant = variants.length === 0 ? "" : variants.includes(requestedVariant) ? requestedVariant : "";
    if (variants.length > 0 && !variant) return NextResponse.json({ error: "Select a valid product option" }, { status: 400 });

    const shippingCents = calculateShipping(quantity, inventory.shipping_base_cents, inventory.shipping_additional_cents);
    const orderId = crypto.randomUUID();
    const orderNumber = `DOM-${orderId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const metadata = {
      order_type: "dom_safety_equipment",
      order_id: orderId,
      order_number: orderNumber,
      product_key: inventory.product_key,
      quantity: String(quantity),
      ...(variant ? { variant } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{
        quantity,
        price_data: {
          currency: "usd",
          unit_amount: inventory.unit_amount_cents,
          product_data: {
            name: variant ? `${inventory.product_name} — ${variant}` : inventory.product_name,
            description: inventory.description,
          },
        },
      }],
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: "U.S. Ground Shipping",
          fixed_amount: { amount: shippingCents, currency: "usd" },
          delivery_estimate: {
            minimum: { unit: "business_day", value: 5 },
            maximum: { unit: "business_day", value: 10 },
          },
        },
      }],
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${siteUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/safety-equipment?checkout=cancelled`,
    });

    const { error: orderError } = await admin.rpc("create_shop_checkout_service", {
      p_order_id: orderId,
      p_order_number: orderNumber,
      p_session_id: session.id,
      p_product_key: inventory.product_key,
      p_product_name: inventory.product_name,
      p_variant: variant,
      p_quantity: quantity,
      p_unit_amount_cents: inventory.unit_amount_cents,
      p_shipping_cents: shippingCents,
    });
    if (orderError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new Error(`Unable to record order: ${orderError.message}`);
    }
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to start checkout";
    console.error("shop checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
