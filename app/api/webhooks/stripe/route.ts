import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

// POST /api/webhooks/stripe
// Verifies the Stripe signature, then keeps Supabase in sync with events
// Stripe controls: Connect account capability changes, and payment outcomes.
// This previously duplicated checkout/route.ts by mistake — it never
// verified a signature or handled any event at all.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e: any) {
    console.error("Stripe webhook signature verification failed:", e.message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await supabaseAdmin
          .from("contractors")
          .update({
            stripe_payouts_enabled: account.payouts_enabled ?? false,
            stripe_charges_enabled: account.charges_enabled ?? false,
          })
          .eq("stripe_connect_account_id", account.id);
        break;
      }

      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await supabaseAdmin
          .from("payments")
          .update({ status: "captured" })
          .eq("stripe_payment_intent_id", intent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", intent.id);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Stripe webhook handling error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
