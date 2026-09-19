import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { paymentReceived } from "@/lib/resend/templates";
import { fulfillShopCheckout, markShopCheckoutFailed } from "@/lib/shop/orders";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
  } catch (error: unknown) {
    console.error("Stripe webhook signature verification failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await admin.from("contractors").update({ stripe_payouts_enabled: account.payouts_enabled ?? false, stripe_charges_enabled: account.charges_enabled ?? false }).eq("stripe_connect_account_id", account.id);
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const { data: payment } = await admin.from("payments").update({ status: "captured" }).eq("stripe_payment_intent_id", intent.id).select("client_id, amount_total_cents, assignment_id").maybeSingle();
        if (payment?.client_id) {
          const { data: client } = await admin.from("clients").select("email, contact_name").eq("id", payment.client_id).maybeSingle();
          if (client?.email) {
            const message = paymentReceived({ clientName: client.contact_name ?? "there", amountCents: payment.amount_total_cents });
            await sendNotification({ to: client.email, emailType: "payment_received", recipientType: "customer", recipientEntityId: payment.client_id, assignmentId: payment.assignment_id ?? undefined, subject: message.subject, html: message.html });
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await admin.from("payments").update({ status: "failed" }).eq("stripe_payment_intent_id", intent.id);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") await fulfillShopCheckout(session);
        if (session.mode === "subscription" && session.metadata?.contractor_id) {
          const resource = session.metadata.subscription_type === "resource_access";
          await admin.from("contractors").update(resource ? { resource_access_subscription_id: session.subscription as string, resource_access_active: true } : { stripe_subscription_id: session.subscription as string, subscription_active: true }).eq("id", session.metadata.contractor_id);
        }
        break;
      }
      case "checkout.session.async_payment_succeeded":
        await fulfillShopCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        await markShopCheckoutFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await markShopCheckoutFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const resource = subscription.metadata?.subscription_type === "resource_access";
        await admin.from("contractors").update(resource ? { resource_access_active: subscription.status === "active" } : { subscription_active: subscription.status === "active" }).eq(resource ? "resource_access_subscription_id" : "stripe_subscription_id", subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const resource = subscription.metadata?.subscription_type === "resource_access";
        await admin.from("contractors").update(resource ? { resource_access_active: false } : { subscription_active: false }).eq(resource ? "resource_access_subscription_id" : "stripe_subscription_id", subscription.id);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    console.error("Stripe webhook handling error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
