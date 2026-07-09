import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { bookingConfirmation } from "@/lib/resend/templates";

// POST /api/notify/booking-confirmed  { missionRequestId }
// Fired from app/admin/missions/[id]/page.tsx's advanceStatus() whenever the
// generic pipeline-advance button moves a mission to 'approved' — there's no
// dedicated "confirm booking" action in this app, so this is the closest
// real signal to a client's booking being confirmed.
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
      .select("id, requester_name, requester_email, company, service_type, location, quoted_amount_cents, client_id")
      .eq("id", missionRequestId)
      .single();

    if (!mr) {
      return NextResponse.json({ error: "mission not found" }, { status: 404 });
    }

    // Prefer the linked clients row (kept up to date independently of the
    // original request) but fall back to the raw fields captured at
    // intake — self-service-created missions always have a client_id,
    // public-form missions never do.
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
      console.error(`booking-confirmed: mission ${missionRequestId} has no client email on file — skipping notification`);
      return NextResponse.json({ skipped: true, reason: "no client email on file" });
    }

    const { subject, html } = bookingConfirmation({
      clientName,
      missionTitle: mr.company ?? mr.requester_name ?? undefined,
      serviceType: mr.service_type ?? undefined,
      location: mr.location ?? undefined,
      totalCents: mr.quoted_amount_cents ?? undefined,
    });

    const result = await sendNotification({
      to: clientEmail,
      emailType: "booking_confirmation",
      recipientType: "customer",
      recipientEntityId: mr.client_id ?? undefined,
      missionRequestId: mr.id,
      subject,
      html,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("booking-confirmed notify error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
