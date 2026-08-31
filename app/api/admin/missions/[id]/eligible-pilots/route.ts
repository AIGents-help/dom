import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";
import { computeEligibility } from "@/lib/pilotAssetsPipeline";
import { getServiceTypeRequirements } from "@/lib/pilotAssetsServer";

// GET /api/admin/missions/[id]/eligible-pilots
// "Find Eligible Pilots" for mission staffing (issue #15 item 6) — derives
// required capabilities from the mission's service_type (jobs.service_type,
// same table the pilot queue reads), then runs every active/verified
// contractor's active-asset capability set through the identical
// computeEligibility() pure function the pilot-facing queue and claim
// routes use, so admin staffing decisions and pilot-facing eligibility can
// never silently disagree.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  // `id` is a mission_requests.id before a job exists (pre-assignment,
  // the common case admins use this for) or a jobs.id once one does —
  // this page's own [id] route param means either depending on mission
  // lifecycle stage, so check both rather than assume.
  const [{ data: missionRequest }, { data: job }] = await Promise.all([
    admin.from("mission_requests").select("id, service_type").eq("id", id).maybeSingle(),
    admin.from("jobs").select("id, service_type").eq("id", id).maybeSingle(),
  ]);
  const serviceType = missionRequest?.service_type ?? job?.service_type;
  if (!missionRequest && !job) return NextResponse.json({ error: "Mission not found." }, { status: 404 });

  const requirements = await getServiceTypeRequirements(admin, serviceType);

  const { data: contractors } = await admin
    .from("contractors")
    .select("id, full_name, email, service_area, status, part107_verified, insurance_verified, pilot_assets(status, archived_at, capabilities_verified, pilot_asset_capabilities(capability))")
    .eq("status", "active")
    .eq("part107_verified", true)
    .eq("insurance_verified", true);

  const pilots = requirements.length === 0 ? [] : (contractors ?? [])
    .map((c) => {
      const active = new Set<string>();
      for (const asset of (c.pilot_assets ?? []) as { status: string; archived_at: string | null; capabilities_verified: boolean; pilot_asset_capabilities: { capability: string }[] }[]) {
        if (asset.status !== "active" || asset.archived_at || !asset.capabilities_verified) continue;
        for (const cap of asset.pilot_asset_capabilities ?? []) active.add(cap.capability);
      }
      const eligibility = computeEligibility(requirements, active);
      return {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        service_area: c.service_area,
        part107_verified: c.part107_verified,
        insurance_verified: c.insurance_verified,
        eligibility,
      };
    })
    .filter((p) => p.eligibility.eligible)
    .sort((a, b) => (a.eligibility.fit === b.eligibility.fit ? 0 : a.eligibility.fit === "eligible" ? -1 : 1));

  return NextResponse.json({ requirements, pilots, configured: requirements.length > 0 });
}
