import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { sendNotification } from "@/lib/resend/client";
import { missionClaimed } from "@/lib/resend/templates";

// POST /api/notify/mission-claimed  { missionRequestId }
// Fired from the pilot's own session right after pilot_request_mission()
// succeeds — best-effort, matches the pattern of every other /api/notify/*
// route. Pilot-triggered (not admin-triggered like mission-available), so
// authorization here is "the caller is the contractor who actually holds
// this claim," not isAdminRequest().
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { missionRequestId } = await req.json();
    if (!missionRequestId) {
      return NextResponse.json({ error: "missionRequestId required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: contractor } = await admin
      .from("contractors")
      .select("id, full_name")
      .eq("user_id", user.id)
      .single();
    if (!contractor) return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });

    const { data: mr } = await admin
      .from("mission_requests")
      .select("id, service_type, claimed_by_contractor_id")
      .eq("id", missionRequestId)
      .single();
    if (!mr) return NextResponse.json({ error: "mission not found" }, { status: 404 });
    if (mr.claimed_by_contractor_id !== contractor.id) {
      return NextResponse.json({ error: "This pilot has not claimed that mission" }, { status: 403 });
    }

    const { data: quote } = await admin
      .from("quotes")
      .select("contractor_cents")
      .eq("mission_request_id", missionRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const notifyEmail = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || "ops@droneopsman.com";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.droneopsman.com";

    const { subject, html } = missionClaimed({
      pilotName: contractor.full_name,
      serviceType: mr.service_type ?? "mission",
      payoutCents: quote?.contractor_cents ?? null,
      reviewUrl: `${siteUrl}/admin/missions/${mr.id}`,
    });

    const result = await sendNotification({
      to: notifyEmail,
      emailType: "admin_mission_claimed",
      recipientType: "admin",
      missionRequestId: mr.id,
      subject,
      html,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("mission-claimed notify error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
