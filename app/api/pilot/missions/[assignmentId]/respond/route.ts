import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { sendClientMissionUpdate } from "@/lib/resend/clientMissionUpdates";

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getSupabaseAnonServer(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { assignmentId } = await params;
  const { action } = await req.json();
  if (action !== "accept" && action !== "decline") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

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
