import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { isAssetActive } from "@/lib/pilotAssetsPipeline";

// GET  /api/pilot/missions/[assignmentId]/assets — the pilot's active
//      assets, annotated with whether each is currently selected for this
//      assignment.
// POST /api/pilot/missions/[assignmentId]/assets — replace the asset
//      selection for this assignment (issue #15 item 5: "allow them to
//      select the specific asset(s) they intend to use from their active
//      inventory"). Every asset id is re-verified server-side as belonging
//      to this pilot and currently active — the browser's selection is
//      never trusted as sufficient on its own.
async function loadOwnedAssignment(admin: ReturnType<typeof getSupabaseAdmin>, assignmentId: string, contractorId: string) {
  const { data } = await admin.from("mission_assignments").select("id, contractor_id").eq("id", assignmentId).eq("contractor_id", contractorId).maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { assignmentId } = await params;
  const admin = getSupabaseAdmin();
  const assignment = await loadOwnedAssignment(admin, assignmentId, auth.contractor.id);
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  const [{ data: assets }, { data: selected }] = await Promise.all([
    admin.from("pilot_assets").select("id, asset_type, display_name, manufacturer, model, status, archived_at").eq("contractor_id", auth.contractor.id).order("created_at", { ascending: false }),
    admin.from("mission_asset_assignments").select("asset_id, role").eq("mission_assignment_id", assignmentId),
  ]);

  const selectedIds = new Set((selected ?? []).map((s) => s.asset_id));
  return NextResponse.json({
    assets: (assets ?? []).filter((a) => isAssetActive(a)).map((a) => ({ ...a, selected: selectedIds.has(a.id) })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { assignmentId } = await params;
  const admin = getSupabaseAdmin();
  const assignment = await loadOwnedAssignment(admin, assignmentId, auth.contractor.id);
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const requestedIds: string[] = Array.isArray(body.assetIds) ? body.assetIds.filter((id: unknown) => typeof id === "string") : [];

  const { data: owned } = await admin.from("pilot_assets").select("id, status, archived_at").eq("contractor_id", auth.contractor.id).in("id", requestedIds.length ? requestedIds : ["00000000-0000-0000-0000-000000000000"]);
  const validIds = new Set((owned ?? []).filter((a) => isAssetActive(a)).map((a) => a.id));
  const assetIds = requestedIds.filter((id) => validIds.has(id));

  const { error: delError } = await admin.from("mission_asset_assignments").delete().eq("mission_assignment_id", assignmentId);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  if (assetIds.length > 0) {
    const { error: insError } = await admin.from("mission_asset_assignments").insert(assetIds.map((asset_id) => ({ mission_assignment_id: assignmentId, asset_id, role: "aircraft" })));
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assetIds });
}
