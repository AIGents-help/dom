import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendClientMissionUpdate } from "@/lib/resend/clientMissionUpdates";

const EVENTS = new Set(["pilot_assigned", "date_scheduled", "mission_complete"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null) as { event?: string; resendKey?: string } | null;
  const event = body?.event ?? "";
  if (!EVENTS.has(event)) {
    return NextResponse.json({ error: "Invalid mission notification event" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: mission } = await admin
    .from("mission_requests")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

  const { data: job } = await admin
    .from("jobs")
    .select("id,status,scheduled_for,completed_at")
    .eq("mission_request_id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "Mission job not found" }, { status: 404 });

  const { data: assignments, error: assignmentError } = await admin
    .from("mission_assignments")
    .select("id,status,assignment_role,created_at")
    .eq("job_id", job.id)
    .order("created_at", { ascending: false });
  if (assignmentError) {
    return NextResponse.json({ error: "Mission assignments could not be loaded" }, { status: 500 });
  }

  const assignment = (assignments ?? []).find((item) =>
    !["declined", "cancelled"].includes(item.status),
  );
  if (!assignment) {
    return NextResponse.json({ error: "No active pilot assignment exists for this mission" }, { status: 409 });
  }

  if (event === "pilot_assigned" && !["accepted", "scheduled", "in_progress", "submitted", "qc_passed", "paid"].includes(assignment.status)) {
    return NextResponse.json({ error: "The pilot has not accepted this mission yet" }, { status: 409 });
  }

  if (event === "date_scheduled" && !job.scheduled_for) {
    return NextResponse.json({ error: "Set the mission date before resending the schedule notification" }, { status: 409 });
  }

  if (event === "mission_complete" && !job.completed_at && !["delivered", "closed"].includes(mission.status)) {
    return NextResponse.json({ error: "Mission completion has not been recorded yet" }, { status: 409 });
  }

  const resendKey = typeof body?.resendKey === "string" && body.resendKey.trim()
    ? body.resendKey.trim().slice(0, 80)
    : crypto.randomUUID();

  const result = event === "pilot_assigned"
    ? await sendClientMissionUpdate(assignment.id, { type: "pilot_assigned" }, { force: true, trigger: "admin_manual_resend", resendKey })
    : event === "date_scheduled"
      ? await sendClientMissionUpdate(
          assignment.id,
          { type: "date_scheduled", scheduledFor: job.scheduled_for!, rescheduled: true },
          { force: true, trigger: "admin_manual_resend", resendKey },
        )
      : await sendClientMissionUpdate(assignment.id, { type: "mission_complete" }, { force: true, trigger: "admin_manual_resend", resendKey });

  if (!result.success && !("skipped" in result)) {
    return NextResponse.json({ error: result.error ?? "Notification could not be sent" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, result });
}
