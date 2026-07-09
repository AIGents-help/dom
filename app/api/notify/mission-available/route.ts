import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification } from "@/lib/resend/client";
import { missionAvailable } from "@/lib/resend/templates";

// POST /api/notify/mission-available  { missionRequestId, contractorId }
// Fired from app/admin/missions/[id]/page.tsx's offerToContractor() right
// after admin_offer_mission succeeds — that RPC is the one real place a
// mission becomes available to a specific pilot (this app offers to one
// contractor directly rather than broadcasting to a pool).
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { missionRequestId, contractorId } = await req.json();
    if (!missionRequestId || !contractorId) {
      return NextResponse.json({ error: "missionRequestId and contractorId required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: mr } = await admin
      .from("mission_requests")
      .select("id, requester_name, company, service_type, location")
      .eq("id", missionRequestId)
      .single();
    if (!mr) return NextResponse.json({ error: "mission not found" }, { status: 404 });

    const { data: contractor } = await admin
      .from("contractors")
      .select("email, full_name")
      .eq("id", contractorId)
      .maybeSingle();
    if (!contractor?.email) {
      console.error(`mission-available: contractor ${contractorId} has no email on file — skipping notification`);
      return NextResponse.json({ skipped: true, reason: "no contractor email on file" });
    }

    const { data: quote } = await admin
      .from("quotes")
      .select("contractor_cents")
      .eq("mission_request_id", missionRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { subject, html } = missionAvailable({
      pilotName: contractor.full_name,
      missionTitle: mr.company ?? mr.requester_name ?? "New Mission",
      serviceType: mr.service_type ?? "mission",
      location: mr.location ?? "Location TBD",
      payoutCents: quote?.contractor_cents ?? 0,
    });

    const result = await sendNotification({
      to: contractor.email,
      emailType: "mission_available",
      recipientType: "pilot",
      recipientEntityId: contractorId,
      missionRequestId: mr.id,
      subject,
      html,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("mission-available notify error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
