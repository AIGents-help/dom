import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { shopOrderRefunded, shopOrderShipped } from "@/lib/resend/templates";
import { getShopProduct } from "@/lib/shop/catalog";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const [{ data: orders, error: orderError }, { data: inventory, error: inventoryError }] = await Promise.all([
    admin.from("shop_orders").select("*, shop_order_items(*)").order("created_at", { ascending: false }).limit(250),
    admin.from("shop_inventory").select("*").order("product_name"),
  ]);
  if (orderError || inventoryError) return NextResponse.json({ error: orderError?.message ?? inventoryError?.message }, { status: 500 });
  return NextResponse.json({ orders: orders ?? [], inventory: inventory ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const admin = getSupabaseAdmin();

  if (action === "inventory") {
    const product = getShopProduct(body.productKey);
    const mode = body.fulfillmentMode === "stocked" ? "stocked" : "made_to_order";
    const available = mode === "stocked" ? Number(body.availableQuantity) : null;
    const base = Number(body.shippingBaseCents);
    const additional = Number(body.shippingAdditionalCents);
    if (!product || (available !== null && (!Number.isInteger(available) || available < 0)) || !Number.isInteger(base) || base < 0 || !Number.isInteger(additional) || additional < 0) {
      return NextResponse.json({ error: "Invalid inventory settings" }, { status: 400 });
    }
    const { error } = await admin.from("shop_inventory").update({ fulfillment_mode: mode, available_quantity: available, shipping_base_cents: base, shipping_additional_cents: additional, active: body.active === true, updated_at: new Date().toISOString() }).eq("product_key", product.key);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true });
  }

  const orderId = String(body.orderId ?? "");
  const { data: order, error: loadError } = await admin.from("shop_orders").select("*").eq("id", orderId).maybeSingle();
  if (loadError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "processing" || action === "delivered") {
    const allowed = action === "processing" ? ["new", "inventory_hold"] : ["shipped"];
    if (!allowed.includes(order.status)) return NextResponse.json({ error: `Order cannot be marked ${action} from ${order.status}` }, { status: 409 });
    const changes = action === "delivered" ? { status: "delivered", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { status: "processing", updated_at: new Date().toISOString() };
    const { error } = await admin.from("shop_orders").update(changes).eq("id", orderId).eq("status", order.status);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true });
  }

  if (action === "shipped") {
    const carrier = String(body.carrier ?? "").trim();
    const trackingNumber = String(body.trackingNumber ?? "").trim();
    const trackingUrl = String(body.trackingUrl ?? "").trim();
    if (!carrier || !trackingNumber || (trackingUrl && !/^https?:\/\//i.test(trackingUrl))) return NextResponse.json({ error: "Carrier, tracking number, and a valid optional tracking URL are required" }, { status: 400 });
    if (!["new", "processing", "inventory_hold"].includes(order.status)) return NextResponse.json({ error: "This order cannot be shipped from its current status" }, { status: 409 });
    const { error } = await admin.from("shop_orders").update({ status: "shipped", tracking_carrier: carrier, tracking_number: trackingNumber, tracking_url: trackingUrl || null, shipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId).eq("status", order.status);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (order.customer_email) {
      const message = shopOrderShipped({ customerName: order.customer_name || "there", orderNumber: order.order_number, carrier, trackingNumber, trackingUrl: trackingUrl || undefined });
      await sendNotification({ to: order.customer_email, emailType: "shop_order_shipped", recipientType: "customer", subject: message.subject, html: message.html, metadata: { order_id: orderId }, idempotencyKey: `shop-shipped-${orderId}` });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "refund") {
    if (order.payment_status !== "paid" || !order.stripe_payment_intent_id || ["shipped", "delivered", "refunded"].includes(order.status)) return NextResponse.json({ error: "This order is not eligible for an automatic refund" }, { status: 409 });
    await getStripe().refunds.create({ payment_intent: order.stripe_payment_intent_id, metadata: { order_id: orderId, order_number: order.order_number } }, { idempotencyKey: `shop-refund-${orderId}` });
    const { error } = await admin.rpc("refund_shop_order_service", { p_order_id: orderId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (order.customer_email) {
      const message = shopOrderRefunded({ customerName: order.customer_name || "there", orderNumber: order.order_number, totalCents: order.total_cents });
      await sendNotification({ to: order.customer_email, emailType: "shop_order_refunded", recipientType: "customer", subject: message.subject, html: message.html, metadata: { order_id: orderId }, idempotencyKey: `shop-refunded-${orderId}` });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
