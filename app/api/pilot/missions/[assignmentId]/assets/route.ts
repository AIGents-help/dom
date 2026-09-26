import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { isAssetActive, resolveAssetCapabilities } from "@/lib/pilotAssetsPipeline";

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
    admin.from("pilot_assets").select("id, asset_type, display_name, manufacturer, model, status, archived_at, registration_number, remote_id, capabilities_verified, pilot_asset_capabilities(capability)").eq("contractor_id", auth.contractor.id).order("created_at", { ascending: false }),
    admin.from("mission_asset_assignments").select("asset_id, role").eq("mission_assignment_id", assignmentId),
  ]);

  const selectedIds = new Set((selected ?? []).map((s) => s.asset_id));
  return NextResponse.json({
    assets: (assets ?? []).filter((a) => isAssetActive(a)).map((a) => {
      const stored = (a.pilot_asset_capabilities ?? []).map((row: { capability: string }) => row.capability);
      const resolution = resolveAssetCapabilities(a, stored);
      return {
        ...a,
        pilot_asset_capabilities: undefined,
        capabilities: resolution.capabilities,
        capabilities_verified: resolution.recognized || a.capabilities_verified,
        capability_source: resolution.source,
        selected: selectedIds.has(a.id),
      };
    }),
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

  const uniqueRequestedIds = [...new Set(requestedIds)];
  if (uniqueRequestedIds.length > 0) {
    const { data: requestedAssets } = await admin
      .from("pilot_assets")
      .select("id, asset_type, manufacturer, model, display_name, capabilities_verified, pilot_asset_capabilities(capability)")
      .eq("contractor_id", auth.contractor.id)
      .in("id", uniqueRequestedIds);

    for (const asset of requestedAssets ?? []) {
      const stored = (asset.pilot_asset_capabilities ?? []).map((row: { capability: string }) => row.capability);
      const resolution = resolveAssetCapabilities(asset, stored);
      if (!resolution.recognized) continue;

      const storedKey = [...stored].sort().join("\u0000");
      const catalogKey = [...resolution.capabilities].sort().join("\u0000");
      if (storedKey !== catalogKey) {
        await admin.from("pilot_asset_capabilities").delete().eq("asset_id", asset.id);
        if (resolution.capabilities.length > 0) {
          const { error: syncError } = await admin.from("pilot_asset_capabilities").insert(
            resolution.capabilities.map((capability) => ({ asset_id: asset.id, capability }))
          );
          if (syncError) return NextResponse.json({ error: "DOM could not synchronize the recognized aircraft capability profile." }, { status: 500 });
        }
      }
      if (!asset.capabilities_verified || storedKey !== catalogKey) {
        await admin.from("pilot_assets").update({
          capabilities_verified: true,
          capabilities_verified_at: new Date().toISOString(),
        }).eq("id", asset.id).eq("contractor_id", auth.contractor.id);
      }
    }
  }

  const { data: assetIds, error } = await admin.rpc("pilot_replace_mission_assets_service", {
    p_mission_assignment_id: assignmentId,
    p_actor_user_id: auth.contractor.user_id,
    p_asset_ids: uniqueRequestedIds,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, assetIds: assetIds ?? [] });
}
