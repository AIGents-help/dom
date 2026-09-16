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

  if (action === "return") {
    const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
    const { error: returnError } = await getSupabaseAdmin().rpc("pilot_return_mission_to_dom", {
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

  const { error } = await supabase.rpc(
    action === "accept" ? "accept_mission_assignment" : "decline_mission_assignment",
    action === "accept" ? { p_assignment_id: assignmentId } : { p_assignment_id: assignmentId, p_reason: null }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (action === "accept") {
    try { await sendClientMissionUpdate(assignmentId, { type: "pilot_assigned" }); }
    catch (emailError) { console.error("client pilot-assigned email failed", emailError); }
  }
  return NextResponse.json({ ok: true });
}
