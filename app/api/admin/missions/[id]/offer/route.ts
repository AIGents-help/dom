import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { missionAvailable } from "@/lib/resend/templates";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const contractorId = typeof body.contractorId === "string" ? body.contractorId : "";
    if (!UUID.test(id) || !UUID.test(contractorId)) {
      return NextResponse.json({ error: "A valid mission and pilot are required." }, { status: 400 });
    }

    let scheduledFor: string | null = null;
    if (body.scheduledFor) {
      const parsed = new Date(body.scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Scheduled date is invalid." }, { status: 400 });
      }
      scheduledFor = parsed.toISOString();
    }

    const admin = getSupabaseAdmin();
    const { data: assignmentId, error: offerError } = await admin.rpc("admin_offer_mission", {
      p_mission_request_id: id,
      p_contractor_id: contractorId,
      p_scheduled_for: scheduledFor,
    });

    if (offerError) {
      const conflict = /already|active pilot offer|different pilot/i.test(offerError.message);
      return NextResponse.json({ error: offerError.message }, { status: conflict ? 409 : 400 });
    }

    let notificationWarning: string | null = null;
    try {
      const [{ data: mission }, { data: contractor }] = await Promise.all([
        admin
          .from("mission_requests")
          .select("id, requester_name, company, service_type, location")
          .eq("id", id)
          .single(),
        admin
          .from("contractors")
          .select("email, full_name")
          .eq("id", contractorId)
          .single(),
      ]);

      if (!mission || !contractor?.email) {
        notificationWarning = "Offer saved, but the pilot has no email address for notification.";
      } else {
        const { data: assignment } = await admin
          .from("mission_assignments")
          .select("contractor_payout_cents")
          .eq("id", assignmentId)
          .single();
        const { subject, html } = missionAvailable({
          pilotName: contractor.full_name,
          missionTitle: mission.company ?? mission.requester_name ?? "New Mission",
          serviceType: mission.service_type ?? "mission",
          location: mission.location ?? "Location TBD",
          payoutCents: assignment?.contractor_payout_cents ?? 0,
        });
        const result = await sendNotification({
          to: contractor.email,
          emailType: "mission_available",
          recipientType: "pilot",
          recipientEntityId: contractorId,
          missionRequestId: mission.id,
          assignmentId,
          subject,
          html,
          idempotencyKey: `mission-offer/${assignmentId}`,
        });
        if (!result.success) {
          notificationWarning = "Offer saved, but the email notification could not be sent.";
        }
      }
    } catch (notificationError) {
      console.error("mission offer notification failed", notificationError);
      notificationWarning = "Offer saved, but the email notification could not be sent.";
    }

    return NextResponse.json({ ok: true, assignmentId, notificationWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not offer mission.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
