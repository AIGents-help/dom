import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { adminShopOrder, shopOrderConfirmation } from "@/lib/resend/templates";

type ShippingDetails = { name?: string | null; address?: Stripe.Address | null };

function sessionShipping(session: Stripe.Checkout.Session): ShippingDetails | null {
  const value = session as Stripe.Checkout.Session & {
    shipping_details?: ShippingDetails | null;
    collected_information?: { shipping_details?: ShippingDetails | null } | null;
  };
  return value.collected_information?.shipping_details ?? value.shipping_details ?? null;
}

export async function fulfillShopCheckout(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.order_type !== "dom_safety_equipment" || session.payment_status !== "paid") return;
  const admin = getSupabaseAdmin();
  const shipping = sessionShipping(session);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? "";
  const { data, error } = await admin.rpc("complete_shop_order_service", {
    p_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
    p_customer_email: session.customer_details?.email ?? session.customer_email ?? null,
    p_customer_name: session.customer_details?.name ?? shipping?.name ?? null,
    p_customer_phone: session.customer_details?.phone ?? null,
    p_currency: session.currency ?? "usd",
    p_subtotal_cents: session.amount_subtotal ?? 0,
    p_shipping_cents: session.total_details?.amount_shipping ?? 0,
    p_tax_cents: session.total_details?.amount_tax ?? 0,
    p_discount_cents: session.total_details?.amount_discount ?? 0,
    p_total_cents: session.amount_total ?? 0,
    p_shipping_name: shipping?.name ?? null,
    p_shipping_address: shipping?.address ?? null,
  });
  if (error) throw new Error(`Shop fulfillment failed: ${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.order_id) throw new Error("Shop fulfillment returned no order");

  const { data: order, error: orderError } = await admin
    .from("shop_orders")
    .select("id, order_number, customer_email, customer_name, total_cents, shop_order_items(product_name, variant, quantity)")
    .eq("id", result.order_id)
    .single();
  if (orderError || !order) throw new Error(`Paid shop order could not be loaded: ${orderError?.message ?? "not found"}`);
  const items = (order.shop_order_items ?? []) as Array<{ product_name: string; variant: string | null; quantity: number }>;
  const itemSummary = items.map((item) => `${item.quantity}× ${item.product_name}${item.variant ? ` (${item.variant})` : ""}`).join(", ");
  if (order.customer_email) {
    const message = shopOrderConfirmation({ customerName: order.customer_name || "there", orderNumber: order.order_number, itemSummary, totalCents: order.total_cents });
    await sendNotification({ to: order.customer_email, emailType: "shop_order_confirmation", recipientType: "customer", subject: message.subject, html: message.html, metadata: { order_id: order.id }, idempotencyKey: `shop-confirmation-${order.id}` });
  }
  if (process.env.NOTIFY_EMAIL) {
    const message = adminShopOrder({ orderNumber: order.order_number, itemSummary, totalCents: order.total_cents, adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://droneopsman.com"}/admin/orders` });
    await sendNotification({ to: process.env.NOTIFY_EMAIL, emailType: "admin_shop_order", recipientType: "admin", subject: message.subject, html: message.html, metadata: { order_id: order.id }, idempotencyKey: `admin-shop-order-${order.id}` });
  }
}

export async function markShopCheckoutFailed(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.order_type !== "dom_safety_equipment") return;
  const admin = getSupabaseAdmin();
  await admin.from("shop_orders").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("stripe_checkout_session_id", session.id).eq("payment_status", "pending");
}
