import { NextRequest, NextResponse } from "next/server";
import { getStripe, commissionCents } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/checkout  { assignmentId: string }
// Charges the client the full mission price; routes the contractor's share to their
// Express account; DOM keeps the application fee (commission). Destination charge =>
// DOM is merchant of record.
export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const { assignmentId } = await req.json();

    // Pull the assignment + the contractor's payout account in one go.
    const { data: a, error } = await supabaseAdmin
      .from("mission_assignments")
      .select(
        `id, status, mission_price_cents, contractor_payout_cents, dom_commission_cents,
         job_id, contractor:contractors ( id, stripe_connect_account_id, part107_verified, insurance_verified )`
      )
      .eq("id", assignmentId)
      .single();

    if (error || !a) {
      return NextResponse.json({ error: "assignment not found" }, { status: 404 });
    }

    const contractor: any = Array.isArray(a.contractor) ? a.contractor[0] : a.contractor;

    // ---- Risk gates: do not pay an unverified pilot. ----
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

    // Commission: use the stored value if present, else compute from default rate.
    const fee = a.dom_commission_cents ?? commissionCents(total);

    const intent = await stripe.paymentIntents.create({
      amount: total,
      currency: "usd",
      application_fee_amount: fee,
      transfer_data: { destination: contractor.stripe_connect_account_id },
      automatic_payment_methods: { enabled: true },
      metadata: { assignment_id: a.id, job_id: a.job_id, contractor_id: contractor.id },
    });

    // Record the intended payment; the webhook will flip status on success.
    await supabaseAdmin.from("payments").insert({
      assignment_id: a.id,
      contractor_id: contractor.id,
      stripe_payment_intent_id: intent.id,
      amount_total_cents: total,
      application_fee_cents: fee,
      contractor_amount_cents: total - fee,
      status: "pending",
    });

    return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e: any) {
    console.error("checkout error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
