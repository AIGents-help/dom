import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { ASSET_TYPES, ASSET_STATUS_OPTIONS, CAPABILITIES } from "@/lib/pilotAssetsPipeline";

// GET /api/pilot/assets — the calling pilot's own assets + capabilities.
// POST /api/pilot/assets — create a new asset (+ its capability tags).
// Same resolveContractor() Bearer-token pattern as every other pilot route
// (lib/pilotAuth.ts) — contractor_id is never taken from the browser.
export async function GET(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const { data: assets, error } = await admin
    .from("pilot_assets")
    .select("*, pilot_asset_capabilities(capability)")
    .eq("contractor_id", auth.contractor.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shaped = (assets ?? []).map((a) => ({
    ...a,
    capabilities: (a.pilot_asset_capabilities ?? []).map((c: { capability: string }) => c.capability),
    pilot_asset_capabilities: undefined,
  }));

  return NextResponse.json({ assets: shaped });
}

const VALID_ASSET_TYPES: Set<string> = new Set(ASSET_TYPES.map((t) => t.value));
const VALID_STATUSES: Set<string> = new Set(ASSET_STATUS_OPTIONS.map((s) => s.value));
const VALID_CAPABILITIES: Set<string> = new Set(CAPABILITIES.map((c) => c.value));

export async function POST(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  if (typeof body.asset_type !== "string" || !VALID_ASSET_TYPES.has(body.asset_type)) {
    return NextResponse.json({ error: "A valid asset_type is required." }, { status: 400 });
  }
  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : "active";
  const capabilities: string[] = Array.isArray(body.capabilities) ? body.capabilities.filter((c: unknown) => typeof c === "string" && VALID_CAPABILITIES.has(c)) : [];

  const admin = getSupabaseAdmin();
  const { data: asset, error } = await admin
    .from("pilot_assets")
    .insert({
      contractor_id: auth.contractor.id,
      asset_type: body.asset_type,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      display_name: body.display_name ?? null,
      serial_number: body.serial_number ?? null,
      registration_number: body.registration_number ?? null,
      remote_id: body.remote_id ?? null,
      firmware_version: body.firmware_version ?? null,
      acquired_at: body.acquired_at ?? null,
      status,
      public_visible: !!body.public_visible,
      public_description: body.public_description ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error || !asset) return NextResponse.json({ error: error?.message ?? "Could not create asset." }, { status: 500 });

  if (capabilities.length > 0) {
    const { error: capError } = await admin.from("pilot_asset_capabilities").insert(capabilities.map((capability) => ({ asset_id: asset.id, capability })));
    if (capError) return NextResponse.json({ error: capError.message }, { status: 500 });
  }

  return NextResponse.json({ asset: { ...asset, capabilities } }, { status: 201 });
}
