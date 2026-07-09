import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { deliverableReady } from "@/lib/resend/templates";

// POST /api/notify/deliverable-ready  { missionRequestId }
// Fired from app/admin/missions/[id]/page.tsx's advanceStatus() when the
// generic pipeline-advance button reaches 'delivered' — same pattern as
// booking-confirmed on 'approved'. There's no real deliverable-upload
// feature in this app yet (no code anywhere writes to the `deliverables`
// table), so this fires without a deliverableUrl for now — the email just
// won't render a "View Deliverables" button until that feature exists.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { missionRequestId } = await req.json();
    if (!missionRequestId) {
      return NextResponse.json({ error: "missionRequestId required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: mr } = await admin
      .from("mission_requests")
      .select("id, requester_name, requester_email, company, client_id")
      .eq("id", missionRequestId)
      .single();

    if (!mr) {
      return NextResponse.json({ error: "mission not found" }, { status: 404 });
    }

    let clientEmail: string | null = mr.requester_email;
    let clientName = mr.requester_name ?? mr.company ?? "there";
    if (mr.client_id) {
      const { data: client } = await admin
        .from("clients")
        .select("email, contact_name")
        .eq("id", mr.client_id)
        .maybeSingle();
      if (client?.email) clientEmail = client.email;
      if (client?.contact_name) clientName = client.contact_name;
    }

    if (!clientEmail) {
      console.error(`deliverable-ready: mission ${missionRequestId} has no client email on file — skipping notification`);
      return NextResponse.json({ skipped: true, reason: "no client email on file" });
    }

    const { subject, html } = deliverableReady({
      clientName,
      missionTitle: mr.company ?? mr.requester_name ?? undefined,
    });

    const result = await sendNotification({
      to: clientEmail,
      emailType: "deliverable_ready",
      recipientType: "customer",
      recipientEntityId: mr.client_id ?? undefined,
      missionRequestId: mr.id,
      subject,
      html,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("deliverable-ready notify error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
