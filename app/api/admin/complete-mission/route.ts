import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { payoutInitiated } from "@/lib/resend/templates";
import type Stripe from "stripe";

// POST /api/admin/complete-mission  { assignmentId }
//
// Wraps admin_mark_mission_complete (a DB RPC that can't reach Stripe) with
// the escrow release step: once the RPC confirms the work is done, attempt
// a manual stripe.transfers.create() to pay the pilot their captured share.
// QC verification and payment collection are treated as independent facts —
// a failed or missing transfer never blocks or rolls back mission
// completion, it just leaves the mission "qc_passed, unpaid" for an admin to
// retry.
//
// Re-callable by design: an assignment already past 'accepted' with a
// captured-but-untransferred payment skips the RPC (which only accepts
// status = 'accepted' and would otherwise reject the retry) and goes
// straight to the transfer step. This is what makes "Retry Payout" work.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { assignmentId } = await req.json();
    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
    }

    const stripe = getStripe();
    const admin = getSupabaseAdmin();

    const { data: assignment } = await admin
      .from("mission_assignments")
      .select(
        `id, status, contractor:contractors ( id, stripe_connect_account_id, full_name, email )`
      )
      .eq("id", assignmentId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ error: "assignment not found" }, { status: 404 });
    }

    const contractor: any = Array.isArray(assignment.contractor) ? assignment.contractor[0] : assignment.contractor;

    if (assignment.status === "accepted") {
      const { error: rpcError } = await admin.rpc("admin_mark_mission_complete", {
        p_assignment_id: assignmentId,
      });
      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
      }
    } else if (assignment.status !== "qc_passed" && assignment.status !== "paid") {
      return NextResponse.json(
        { error: `assignment is '${assignment.status}' — not in a completable or retryable state` },
        { status: 400 }
      );
    }
    // else: already qc_passed/paid — skip the RPC (it only accepts
    // status = 'accepted' and would reject this as a retry). What happens
    // next (retry transfer / already paid out / nothing to transfer) is
    // fully determined by the payment row read below.

    const { data: payment } = await admin
      .from("payments")
      .select("id, status, stripe_payment_intent_id, stripe_transfer_id, contractor_amount_cents")
      .eq("assignment_id", assignmentId)
      .neq("status", "failed")
      .maybeSingle();

    // Check already-paid-out first: payments.status flips to 'paid_out' (not
    // 'captured') once a transfer succeeds, so this has to be checked before
    // the generic "not captured" catch-all below, or a paid-out payment
    // would incorrectly fall into that branch and report paidOut: false.
    if (payment?.status === "paid_out" || payment?.stripe_transfer_id) {
      return NextResponse.json({ success: true, missionCompleted: true, paidOut: true, note: "already paid out" });
    }

    if (!payment || payment.status !== "captured") {
      return NextResponse.json({
        success: true,
        missionCompleted: true,
        paidOut: false,
        note: "no captured payment on file — nothing to transfer",
      });
    }

    if (!contractor?.stripe_connect_account_id) {
      await admin
        .from("payments")
        .update({ transfer_error: "contractor has no Stripe Connect account on file", transfer_attempted_at: new Date().toISOString() })
        .eq("id", payment.id);
      return NextResponse.json({
        success: true,
        missionCompleted: true,
        paidOut: false,
        transferError: "contractor has no Stripe Connect account on file",
      });
    }

    // Guard against double-paying an assignment whose PaymentIntent was
    // created under the old destination-charge code (transfer_data baked in
    // at creation, auto-splits on capture) — any such intent still open at
    // deploy time already paid the pilot automatically; a manual transfer on
    // top of that would be a real double-payout.
    const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id!, {
      expand: ["latest_charge"],
    });
    const charge = intent.latest_charge as Stripe.Charge | null;
    const legacyTransferId = typeof charge?.transfer === "string" ? charge.transfer : charge?.transfer?.id;

    if (intent.transfer_data?.destination || legacyTransferId) {
      await admin
        .from("payments")
        .update({
          status: "paid_out",
          stripe_transfer_id: legacyTransferId ?? null,
          transfer_error: null,
          transfer_attempted_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      await admin.from("mission_assignments").update({ status: "paid" }).eq("id", assignmentId);
      return NextResponse.json({
        success: true,
        missionCompleted: true,
        paidOut: true,
        note: "already auto-paid via legacy destination charge — no manual transfer created",
      });
    }

    if (!payment.contractor_amount_cents || payment.contractor_amount_cents <= 0) {
      const msg = "no captured contractor_amount_cents on the payment record";
      await admin
        .from("payments")
        .update({ transfer_error: msg, transfer_attempted_at: new Date().toISOString() })
        .eq("id", payment.id);
      return NextResponse.json({ success: true, missionCompleted: true, paidOut: false, transferError: msg });
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: payment.contractor_amount_cents,
        currency: "usd",
        destination: contractor.stripe_connect_account_id,
        source_transaction: charge?.id,
        metadata: { assignment_id: assignmentId, contractor_id: contractor.id, payment_id: payment.id },
      });

      await admin
        .from("payments")
        .update({
          status: "paid_out",
          stripe_transfer_id: transfer.id,
          transfer_error: null,
          transfer_attempted_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      await admin.from("mission_assignments").update({ status: "paid" }).eq("id", assignmentId);

      if (contractor.email) {
        const { subject, html } = payoutInitiated({
          pilotName: contractor.full_name ?? "there",
          amountCents: payment.contractor_amount_cents,
        });
        await sendNotification({
          to: contractor.email,
          emailType: "payout_initiated",
          recipientType: "pilot",
          recipientEntityId: contractor.id,
          assignmentId,
          subject,
          html,
        });
      }

      return NextResponse.json({ success: true, missionCompleted: true, paidOut: true });
    } catch (transferErr: any) {
      const isBalanceIssue = transferErr?.code === "balance_insufficient" || transferErr?.raw?.code === "balance_insufficient";
      const message = isBalanceIssue
        ? "escrow funds unavailable — check the platform account's payout schedule"
        : transferErr.message ?? "transfer failed";

      await admin
        .from("payments")
        .update({ transfer_error: message, transfer_attempted_at: new Date().toISOString() })
        .eq("id", payment.id);

      console.error("complete-mission transfer error:", transferErr);
      return NextResponse.json({
        success: true,
        missionCompleted: true,
        paidOut: false,
        transferError: message,
      });
    }
  } catch (e: any) {
    console.error("complete-mission error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
