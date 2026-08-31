import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { computeEligibility, eligibilityReason } from "@/lib/pilotAssetsPipeline";
import { getContractorActiveCapabilities, getServiceTypeRequirements } from "@/lib/pilotAssetsServer";

// POST /api/pilot/queue/[id]/claim
// Server-side gate in front of the existing `pilot_request_mission` RPC
// (see components/PilotQueue.tsx, which previously called that RPC
// directly from the browser). The RPC itself is a live, un-tracked DB
// function this repo has no migration source for — rather than blindly
// rewrite something we can't fully see, this route adds the actual
// enforcement (issue #15: "Do not allow the browser alone to decide
// eligibility... revalidate server-side") as a pre-check in front of it,
// then calls the RPC exactly as the browser used to, in the pilot's own
// auth context (not service-role) so its internal auth.uid()-based logic
// behaves identically to before.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = getSupabaseAnonServer(authHeader);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors").select("id, status, part107_verified, insurance_verified").eq("user_id", user.id).maybeSingle();
  if (!contractor) return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
  if (contractor.status !== "active" || !contractor.part107_verified || !contractor.insurance_verified) {
    return NextResponse.json({ error: "Pilot not verified — Part 107 and insurance both required" }, { status: 403 });
  }

  const { id } = await params;
  const { data: mission } = await admin.from("mission_requests").select("id, service_type, status").eq("id", id).maybeSingle();
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  if (mission.status !== "approved") return NextResponse.json({ error: "This mission is no longer available." }, { status: 409 });

  const [activeCapabilities, requirements] = await Promise.all([
    getContractorActiveCapabilities(admin, contractor.id),
    getServiceTypeRequirements(admin, mission.service_type),
  ]);
  const eligibility = computeEligibility(requirements, activeCapabilities);
  if (requirements.length === 0) {
    return NextResponse.json({ error: "Mission equipment requirements are not configured. DOM must review this mission before it can be claimed." }, { status: 409 });
  }
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibilityReason(eligibility) ?? "You're not equipped for this mission.", eligibility }, { status: 403 });
  }

  const { error: rpcError } = await supabase.rpc("pilot_request_mission", { p_mission_request_id: id });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
