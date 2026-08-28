import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";

// GET /api/admin/pilot-assets/search?manufacturer=&model=&capability=&service_area=&part107_verified=&insurance_verified=&status=
// Admin pilot equipment/capability search (issue #15 item 6) — answers
// "show pilots with a Matrice 4E" / "show active pilots with thermal in
// this service area" / "show pilots capable of RTK mapping" by filtering
// contractors joined through their pilot_assets/pilot_asset_capabilities.
// All filtering happens server-side against the full (non-redacted) fields
// — this route is admin-only (isAdminRequest), so private asset fields are
// fine to return here, unlike the public profile projection.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const manufacturer = searchParams.get("manufacturer")?.trim();
  const model = searchParams.get("model")?.trim();
  const capability = searchParams.get("capability")?.trim();
  const serviceArea = searchParams.get("service_area")?.trim();
  const part107Verified = searchParams.get("part107_verified");
  const insuranceVerified = searchParams.get("insurance_verified");
  const assetStatus = searchParams.get("status")?.trim();

  const admin = getSupabaseAdmin();

  let assetQuery = admin.from("pilot_assets").select("id, contractor_id, asset_type, manufacturer, model, display_name, status, archived_at, pilot_asset_capabilities(capability)");
  if (manufacturer) assetQuery = assetQuery.ilike("manufacturer", `%${manufacturer}%`);
  if (model) assetQuery = assetQuery.ilike("model", `%${model}%`);
  if (assetStatus) assetQuery = assetQuery.eq("status", assetStatus);
  const { data: assets, error: assetError } = await assetQuery;
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });

  const matchingAssets = (assets ?? []).filter((a) => {
    if (!capability) return true;
    return (a.pilot_asset_capabilities ?? []).some((c: { capability: string }) => c.capability === capability);
  });

  const contractorIds = [...new Set(matchingAssets.map((a) => a.contractor_id))];
  if (contractorIds.length === 0 && (manufacturer || model || capability || assetStatus)) {
    return NextResponse.json({ pilots: [] });
  }

  let contractorQuery = admin
    .from("contractors")
    .select("id, full_name, email, service_area, status, part107_verified, insurance_verified")
    .order("full_name");
  if (contractorIds.length > 0) contractorQuery = contractorQuery.in("id", contractorIds);
  if (serviceArea) contractorQuery = contractorQuery.ilike("service_area", `%${serviceArea}%`);
  if (part107Verified === "true") contractorQuery = contractorQuery.eq("part107_verified", true);
  if (insuranceVerified === "true") contractorQuery = contractorQuery.eq("insurance_verified", true);

  const { data: contractors, error: contractorError } = await contractorQuery;
  if (contractorError) return NextResponse.json({ error: contractorError.message }, { status: 500 });

  const assetsByContractor = new Map<string, typeof matchingAssets>();
  for (const a of matchingAssets) {
    const list = assetsByContractor.get(a.contractor_id) ?? [];
    list.push(a);
    assetsByContractor.set(a.contractor_id, list);
  }

  const pilots = (contractors ?? []).map((c) => ({
    ...c,
    matching_assets: (assetsByContractor.get(c.id) ?? []).map((a) => ({
      id: a.id,
      asset_type: a.asset_type,
      manufacturer: a.manufacturer,
      model: a.model,
      display_name: a.display_name,
      status: a.status,
      archived: !!a.archived_at,
      capabilities: (a.pilot_asset_capabilities ?? []).map((cap: { capability: string }) => cap.capability),
    })),
  }));

  return NextResponse.json({ pilots });
}
