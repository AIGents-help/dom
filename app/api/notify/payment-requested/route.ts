import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { invoiceSent } from "@/lib/resend/templates";

// POST /api/notify/payment-requested  { assignmentId }
// Fired from the "Send Payment Request" button on an accepted assignment
// (app/admin/missions/[id]/page.tsx). Does not pre-create a PaymentIntent —
// that still happens lazily when the client visits /pay/[assignmentId],
// unchanged from before this PR. This route's only job is confirming the
// assignment is in a sensible state to ask and sending the email.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { assignmentId } = await req.json();
    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: a } = await admin
      .from("mission_assignments")
      .select("id, status, mission_price_cents, job:jobs ( id, title, client_id )")
      .eq("id", assignmentId)
      .maybeSingle();

    if (!a) {
      return NextResponse.json({ error: "assignment not found" }, { status: 404 });
    }
    if (a.status !== "accepted") {
      return NextResponse.json({ error: "assignment is not accepted — cannot request payment yet" }, { status: 400 });
    }

    const job: any = Array.isArray(a.job) ? a.job[0] : a.job;
    if (!job?.client_id) {
      return NextResponse.json({ error: "no client on file for this mission" }, { status: 400 });
    }

    const { data: client } = await admin
      .from("clients")
      .select("email, contact_name")
      .eq("id", job.client_id)
      .maybeSingle();

    if (!client?.email) {
      return NextResponse.json({ skipped: true, reason: "no client email on file" });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.droneopsman.com";
    const payUrl = `${siteUrl}/pay/${a.id}`;

    const { subject, html } = invoiceSent({
      clientName: client.contact_name ?? "there",
      amountCents: a.mission_price_cents ?? 0,
      invoiceUrl: payUrl,
    });

    const result = await sendNotification({
      to: client.email,
      emailType: "invoice_sent",
      recipientType: "customer",
      recipientEntityId: job.client_id,
      jobId: job.id,
      assignmentId: a.id,
      subject,
      html,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("payment-requested notify error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
