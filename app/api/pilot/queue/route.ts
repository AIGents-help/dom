import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { fuzzyGrid } from "@/lib/fuzzyLocation";
import { computeEligibility } from "@/lib/pilotAssetsPipeline";
import { getContractorActiveCapabilities, getServiceTypeRequirements } from "@/lib/pilotAssetsServer";

// GET /api/pilot/queue
// Open mission queue — any verified pilot can browse approved-but-unclaimed
// missions here. Gated behind NEXT_PUBLIC_MISSION_QUEUE_ENABLED until escrow
// (a later PR) ships, since an open queue without payment commitment would
// expose client location/price data to every verified pilot pre-claim.
//
// Deliberately never selects requester_name, requester_email, company, the
// raw location string, site_access_instructions, hazards, or notes_for_pilot
// — those only ever reach a pilot once they're actually assigned, via the
// existing /api/pilot/me route (which already never selects them either).
// Location is reduced to a fuzzy ~11km grid cell computed server-side; raw
// lat/long never leaves this route.

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: contractor } = await admin
      .from("contractors")
      .select("id, status, part107_verified, insurance_verified")
      .eq("user_id", user.id)
      .single();

    if (!contractor) {
      return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
    }
    if (contractor.status !== "active" || !contractor.part107_verified || !contractor.insurance_verified) {
      return NextResponse.json({ error: "Pilot not verified — Part 107 and insurance both required" }, { status: 403 });
    }

    const { data: missions } = await admin
      .from("mission_requests")
      .select("id, service_type, status, created_at, scheduled_date, airspace_class, latitude, longitude")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    const ids = (missions ?? []).map((m) => m.id);
    const { data: quotes } = ids.length
      ? await admin
          .from("quotes")
          .select("mission_request_id, contractor_cents, created_at")
          .in("mission_request_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] };

    const payoutByMission = new Map<string, number>();
    for (const q of quotes ?? []) {
      if (!payoutByMission.has(q.mission_request_id)) payoutByMission.set(q.mission_request_id, q.contractor_cents);
    }

    // Equipment-based eligibility (issue #15) — same computeEligibility()
    // pure function the claim route uses to actually enforce this, so
    // display and enforcement can never silently disagree. This is
    // display/filtering only; the browser is never trusted to decide
    // eligibility for the actual claim (see /api/pilot/queue/[id]/claim).
    const [activeCapabilities, { data: allRequirements }] = await Promise.all([
      getContractorActiveCapabilities(admin, contractor.id),
      admin.from("mission_capability_requirements").select("service_type, capability, required"),
    ]);
    const requirementsByServiceType = new Map<string, { capability: string; required: boolean }[]>();
    for (const r of allRequirements ?? []) {
      const list = requirementsByServiceType.get(r.service_type) ?? [];
      list.push({ capability: r.capability, required: r.required });
      requirementsByServiceType.set(r.service_type, list);
    }

    const queue = (missions ?? []).map((m) => {
      const requirements = requirementsByServiceType.get(m.service_type) ?? [];
      const eligibility = computeEligibility(requirements, activeCapabilities);
      return {
        id: m.id,
        service_type: m.service_type,
        status: m.status,
        created_at: m.created_at,
        scheduled_date: m.scheduled_date,
        airspace_class: m.airspace_class,
        area: fuzzyGrid(m.latitude, m.longitude),
        payout_cents: payoutByMission.get(m.id) ?? null,
        eligibility,
      };
    });

    return NextResponse.json({ queue });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
