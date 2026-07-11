import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { paymentReceived } from "@/lib/resend/templates";
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
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .update({ status: "captured" })
          .eq("stripe_payment_intent_id", intent.id)
          .select("client_id, amount_total_cents, assignment_id")
          .maybeSingle();

        // Client receipt — payment_received has existed as a real enum
        // value/EmailType with no template or trigger until this PR.
        if (payment?.client_id) {
          const { data: client } = await supabaseAdmin
            .from("clients")
            .select("email, contact_name")
            .eq("id", payment.client_id)
            .maybeSingle();

          let missionTitle: string | undefined;
          if (payment.assignment_id) {
            const { data: assignment } = await supabaseAdmin
              .from("mission_assignments")
              .select("job:jobs ( title )")
              .eq("id", payment.assignment_id)
              .maybeSingle();
            const job: any = Array.isArray(assignment?.job) ? assignment?.job[0] : assignment?.job;
            missionTitle = job?.title;
          }

          if (client?.email) {
            const { subject, html } = paymentReceived({
              clientName: client.contact_name ?? "there",
              amountCents: payment.amount_total_cents,
              missionTitle,
            });
            await sendNotification({
              to: client.email,
              emailType: "payment_received",
              recipientType: "customer",
              recipientEntityId: payment.client_id,
              assignmentId: payment.assignment_id ?? undefined,
              subject,
              html,
            });
          }
        }
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

      // Pilot subscription lifecycle — two independent products share this
      // handler: the $99/mo self-service commission waiver
      // (subscription_active / stripe_subscription_id) and the resource-
      // access study plan for unverified pilots (resource_access_active /
      // resource_access_subscription_id). A contractor could plausibly hold
      // both at once over their lifecycle, so they're separate columns, not
      // one pair discriminated by a type flag. subscription_type comes from
      // metadata set at checkout (see /api/pilot/subscription/checkout and
      // /api/pilot/resource-access/checkout) — defaults to "self_service"
      // for subscriptions created before this distinction existed.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.metadata?.contractor_id) {
          const isResourceAccess = session.metadata.subscription_type === "resource_access";
          await supabaseAdmin
            .from("contractors")
            .update(
              isResourceAccess
                ? { resource_access_subscription_id: session.subscription as string, resource_access_active: true }
                : { stripe_subscription_id: session.subscription as string, subscription_active: true }
            )
            .eq("id", session.metadata.contractor_id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const isResourceAccess = subscription.metadata?.subscription_type === "resource_access";
        await supabaseAdmin
          .from("contractors")
          .update(
            isResourceAccess
              ? { resource_access_active: subscription.status === "active" }
              : { subscription_active: subscription.status === "active" }
          )
          .eq(isResourceAccess ? "resource_access_subscription_id" : "stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const isResourceAccess = subscription.metadata?.subscription_type === "resource_access";
        await supabaseAdmin
          .from("contractors")
          .update(isResourceAccess ? { resource_access_active: false } : { subscription_active: false })
          .eq(isResourceAccess ? "resource_access_subscription_id" : "stripe_subscription_id", subscription.id);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Stripe webhook handling error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
