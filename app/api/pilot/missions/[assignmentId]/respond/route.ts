import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendClientMissionUpdate } from "@/lib/resend/clientMissionUpdates";

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getSupabaseAnonServer(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { assignmentId } = await params;
  const { action, reason } = await req.json();
  if (action !== "accept" && action !== "decline" && action !== "return") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors").select("id").eq("user_id", user.id).maybeSingle();
  if (!contractor) return NextResponse.json({ error: "Pilot profile not found" }, { status: 404 });
  const { data: assignment } = await admin.from("mission_assignments")
    .select("assignment_role,job:jobs(delivery_responsibility)").eq("id", assignmentId).eq("contractor_id", contractor.id).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Mission assignment not found" }, { status: 404 });
  const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
  const isTeamFieldAssignment = assignment.assignment_role === "field" && job?.delivery_responsibility === "pilot";

  if (action === "return") {
    const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
    const returnFunction = isTeamFieldAssignment ? "pilot_return_team_assignment" : "pilot_return_mission_to_dom";
    const { error: returnError } = await admin.rpc(returnFunction, {
      p_assignment_id: assignmentId,
      p_actor_user_id: user.id,
      p_reason: cleanReason || null,
    });
    if (returnError) {
      const conflict = /accepted or scheduled|payment processing/i.test(returnError.message);
      return NextResponse.json({ error: returnError.message }, { status: conflict ? 409 : 400 });
    }
    return NextResponse.json({ ok: true, returned: true });
  }

  if (isTeamFieldAssignment) {
    const { error } = await admin.rpc("pilot_respond_team_assignment", {
      p_assignment_id: assignmentId,
      p_actor_user_id: user.id,
      p_action: action,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.rpc("pilot_respond_dom_assignment", {
    p_assignment_id: assignmentId,
    p_actor_user_id: user.id,
    p_action: action,
    p_reason: action === "decline" && typeof reason === "string" ? reason.trim().slice(0, 500) || null : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (action === "accept") {
    try { await sendClientMissionUpdate(assignmentId, { type: "pilot_assigned" }); }
    catch (emailError) { console.error("client pilot-assigned email failed", emailError); }
  }
  return NextResponse.json({ ok: true });
}
