import { NextRequest, NextResponse } from "next/server";
import { getStripe, commissionCents } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/checkout  { assignmentId: string }
// Charges the client the full mission price into DOM's own Stripe balance —
// a plain (non-destination) charge. Nothing moves to the pilot at this
// point; that only happens via a separate stripe.transfers.create() call
// from /api/admin/complete-mission once the mission is verified done. This
// is what makes it real escrow instead of an instant auto-split.
//
// Idempotent by assignment: the pay page calls this on every mount, so a
// non-failed payments row already existing for this assignment is reused
// rather than creating a duplicate PaymentIntent. The payments.assignment_id
// partial unique index (where status != 'failed') backs this up at the DB
// layer for the case where two calls race the initial read.
export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const { assignmentId } = await req.json();

    const { data: a, error } = await supabaseAdmin
      .from("mission_assignments")
      .select(
        `id, status, mission_price_cents, contractor_payout_cents, dom_commission_cents,
         job_id, contractor:contractors ( id, stripe_connect_account_id, part107_verified, insurance_verified ),
         job:jobs ( id, title, client_id )`
      )
      .eq("id", assignmentId)
      .single();

    if (error || !a) {
      return NextResponse.json({ error: "assignment not found" }, { status: 404 });
    }

    const contractor: any = Array.isArray(a.contractor) ? a.contractor[0] : a.contractor;
    const job: any = Array.isArray(a.job) ? a.job[0] : a.job;
    const description = job?.title ?? "Drone mission";

    if (!contractor?.stripe_connect_account_id) {
      return NextResponse.json({ error: "contractor has no Stripe account" }, { status: 400 });
    }
    if (!contractor.part107_verified || !contractor.insurance_verified) {
      return NextResponse.json(
        { error: "contractor not cleared (Part 107 / insurance unverified)" },
        { status: 400 }
      );
    }

    const total = a.mission_price_cents;
    if (!total || total <= 0) {
      return NextResponse.json({ error: "mission_price_cents not set" }, { status: 400 });
    }

    // Fast path: reuse an existing non-failed payment instead of creating a
    // second PaymentIntent every time the pay page is (re)loaded.
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("status, stripe_payment_intent_id, amount_total_cents")
      .eq("assignment_id", a.id)
      .neq("status", "failed")
      .maybeSingle();

    if (existing?.status === "captured" || existing?.status === "paid_out") {
      return NextResponse.json({ alreadyPaid: true, amount: existing.amount_total_cents, description });
    }

    if (existing?.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id);
      return NextResponse.json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: total,
        description,
      });
    }

    const fee = a.dom_commission_cents ?? commissionCents(total);

    const intent = await stripe.paymentIntents.create({
      amount: total,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { assignment_id: a.id, job_id: a.job_id, contractor_id: contractor.id },
    });

    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      assignment_id: a.id,
      contractor_id: contractor.id,
      client_id: job?.client_id ?? null,
      stripe_payment_intent_id: intent.id,
      amount_total_cents: total,
      application_fee_cents: fee,
      contractor_amount_cents: total - fee,
      status: "pending",
    });

    if (insertError) {
      // Unique violation on payments_assignment_active_idx: a concurrent
      // request won the race and already inserted a row for this assignment
      // between our read and this write. Cancel the now-orphaned
      // PaymentIntent we just created and hand back whatever the winner
      // wrote instead of erroring or double-charging.
      if (insertError.code === "23505") {
        await stripe.paymentIntents.cancel(intent.id).catch(() => {});
        const { data: winner } = await supabaseAdmin
          .from("payments")
          .select("status, stripe_payment_intent_id, amount_total_cents")
          .eq("assignment_id", a.id)
          .neq("status", "failed")
          .single();
        if (winner?.status === "captured" || winner?.status === "paid_out") {
          return NextResponse.json({ alreadyPaid: true, amount: winner.amount_total_cents, description });
        }
        if (winner?.stripe_payment_intent_id) {
          const winnerIntent = await stripe.paymentIntents.retrieve(winner.stripe_payment_intent_id);
          return NextResponse.json({
            clientSecret: winnerIntent.client_secret,
            paymentIntentId: winnerIntent.id,
            amount: total,
            description,
          });
        }
      }
      throw insertError;
    }

    return NextResponse.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount: total,
      description,
    });
  } catch (e: any) {
    console.error("checkout error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
