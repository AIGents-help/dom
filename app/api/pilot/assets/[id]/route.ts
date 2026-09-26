import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { ASSET_STATUS_OPTIONS, CAPABILITIES, resolveAssetCapabilities } from "@/lib/pilotAssetsPipeline";

const VALID_STATUSES: Set<string> = new Set(ASSET_STATUS_OPTIONS.map((s) => s.value));
const VALID_CAPABILITIES: Set<string> = new Set(CAPABILITIES.map((c) => c.value));

const EDITABLE_FIELDS = [
  "asset_type", "manufacturer", "model", "display_name", "serial_number", "registration_number",
  "remote_id", "firmware_version", "acquired_at", "status", "public_visible",
  "public_description", "notes",
] as const;
const VALID_ASSET_TYPES = new Set(["uav", "controller", "camera_payload", "rtk_gnss", "lidar_payload", "thermal_payload", "battery", "generator", "vehicle", "safety_equipment", "lighting", "computer", "connectivity", "other"]);

// PATCH /api/pilot/assets/[id] — edit fields and/or archive
// (`{ archived: true }` sets archived_at; `{ archived: false }` clears it).
// DELETE /api/pilot/assets/[id] — hard remove.
// Both scoped to the calling pilot's own contractor_id — the URL's [id]
// alone is never trusted as sufficient authorization (same discipline as
// the mapper deliverable download route).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("pilot_assets")
    .select("id, asset_type, manufacturer, model, display_name, metadata")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }
  if (updates.status !== undefined && !VALID_STATUSES.has(updates.status as string)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if (updates.asset_type !== undefined && !VALID_ASSET_TYPES.has(updates.asset_type as string)) {
    return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });
  }
  if (typeof body.archived === "boolean") {
    updates.archived_at = body.archived ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("pilot_assets").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const identity = {
    asset_type: String(updates.asset_type ?? existing.asset_type ?? "uav"),
    manufacturer: (updates.manufacturer ?? existing.manufacturer) as string | null | undefined,
    model: (updates.model ?? existing.model) as string | null | undefined,
    display_name: (updates.display_name ?? existing.display_name) as string | null | undefined,
  };
  const requestedCapabilities: string[] = Array.isArray(body.capabilities)
    ? [...new Set<string>(body.capabilities.filter((c: unknown): c is string => typeof c === "string" && VALID_CAPABILITIES.has(c)))]
    : [];
  const { data: previous } = await admin.from("pilot_asset_capabilities").select("capability").eq("asset_id", id);
  const currentCapabilities = (previous ?? []).map((row) => row.capability);
  const capabilityResolution = resolveAssetCapabilities(
    identity,
    Array.isArray(body.capabilities) ? requestedCapabilities : currentCapabilities,
  );
  const capabilities = capabilityResolution.capabilities;
  const capabilitiesChanged = [...currentCapabilities].sort().join("\u0000") !== [...capabilities].sort().join("\u0000");

  if (capabilitiesChanged) {
    const { error: delError } = await admin.from("pilot_asset_capabilities").delete().eq("asset_id", id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    if (capabilities.length > 0) {
      const { error: insError } = await admin.from("pilot_asset_capabilities").insert(capabilities.map((capability) => ({ asset_id: id, capability })));
      if (insError) {
        const oldCapabilities = currentCapabilities.map((capability) => ({ asset_id: id, capability }));
        if (oldCapabilities.length) await admin.from("pilot_asset_capabilities").insert(oldCapabilities);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
    }
    await admin.from("pilot_assets").update({
      capabilities_verified: capabilityResolution.recognized,
      capabilities_verified_at: capabilityResolution.recognized ? new Date().toISOString() : null,
    }).eq("id", id).eq("contractor_id", auth.contractor.id);
  }

  const previousMetadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata as Record<string, unknown> : {};
  await admin.from("pilot_assets").update({
    metadata: {
      ...previousMetadata,
      capability_source: capabilityResolution.source,
      capability_recognized: capabilityResolution.recognized,
    },
    capabilities_verified: capabilityResolution.recognized,
    capabilities_verified_at: capabilityResolution.recognized ? new Date().toISOString() : null,
  }).eq("id", id).eq("contractor_id", auth.contractor.id);

  const { data: asset } = await admin.from("pilot_assets").select("*, pilot_asset_capabilities(capability)").eq("id", id).single();
  return NextResponse.json({
    asset: asset ? { ...asset, capabilities: (asset.pilot_asset_capabilities ?? []).map((c: { capability: string }) => c.capability), pilot_asset_capabilities: undefined } : null,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin.from("pilot_assets").select("id").eq("id", id).eq("contractor_id", auth.contractor.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const { error } = await admin.from("pilot_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
