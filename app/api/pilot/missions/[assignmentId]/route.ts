import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { sendClientMissionUpdate } from "@/lib/resend/clientMissionUpdates";
import { equipmentChoices } from "@/lib/missionEquipmentGuidance";

const EDITABLE_STATUSES = new Set(["accepted", "in_progress", "submitted"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const { assignmentId } = await params;
    const admin = getSupabaseAdmin();
    const { data: contractor } = await admin.from("contractors").select("id, equipment").eq("user_id", user.id).maybeSingle();
    if (!contractor) return NextResponse.json({ error: "Pilot profile not found" }, { status: 404 });

    const { data: assignment } = await admin
      .from("mission_assignments")
      .select("id, job_id, contractor_id, status, job:jobs(scheduled_for)")
      .eq("id", assignmentId)
      .eq("contractor_id", contractor.id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Mission assignment not found" }, { status: 404 });
    if (!EDITABLE_STATUSES.has(assignment.status)) {
      return NextResponse.json({ error: "Accept the mission before scheduling or editing operational details." }, { status: 409 });
    }

    const body = await req.json();
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    if (body.scheduledFor && Number.isNaN(scheduledFor?.getTime())) {
      return NextResponse.json({ error: "Invalid performance date" }, { status: 400 });
    }
    const clean = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 5000) : "";
    const operationalNotes = clean(body.operationalNotes);
    const siteAccessNotes = clean(body.siteAccessNotes);
    const cautionsAwareness = clean(body.cautionsAwareness);
    const clientCommunications = clean(body.clientCommunications);
    const assignedUav = clean(body.assignedUav);
    const availableAircraft = equipmentChoices(contractor.equipment);
    if (assignedUav && !availableAircraft.includes(assignedUav)) {
      return NextResponse.json({ error: "Select an aircraft listed in your Pilot Profile equipment." }, { status: 400 });
    }

    const previousJob: any = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
    const previousScheduledFor = previousJob?.scheduled_for ?? null;
    const [{ error: jobError }, { error: assignmentError }] = await Promise.all([
      admin.from("jobs").update({ scheduled_for: scheduledFor?.toISOString() ?? null }).eq("id", assignment.job_id),
      admin.from("mission_assignments").update({
        operational_notes: operationalNotes || null,
        site_access_notes: siteAccessNotes || null,
        cautions_awareness: cautionsAwareness || null,
        client_communications: clientCommunications || null,
        assigned_uav: assignedUav || null,
      }).eq("id", assignment.id),
    ]);
    if (jobError || assignmentError) throw jobError ?? assignmentError;

    const nextScheduledFor = scheduledFor?.toISOString() ?? null;
    if (nextScheduledFor && nextScheduledFor !== previousScheduledFor) {
      try {
        await sendClientMissionUpdate(assignmentId, {
          type: "date_scheduled",
          scheduledFor: nextScheduledFor,
          rescheduled: !!previousScheduledFor,
        });
      } catch (emailError) {
        console.error("client schedule email failed", emailError);
      }
    }

    return NextResponse.json({ ok: true, scheduledFor: nextScheduledFor });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Could not update mission" }, { status: 500 });
  }
}
