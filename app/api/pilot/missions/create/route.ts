import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { classifyAirspace } from "@/lib/airspace";
import { calculateQuote, type QuoteInput } from "@/lib/quoting";
import { rateLimitResponse } from "@/lib/rateLimit";

// POST /api/pilot/missions/create
// Lets an approved pilot (contractors.can_create_missions = true) create and
// immediately self-assign their own mission — they source the client, so
// there's no separate "offer" step. The total price is computed here
// server-side (the same server-authoritative principle as
// /api/mission-request); the DOM/pilot commission split is NOT — that's
// computed inside pilot_create_own_mission itself via
// calculate_commission_bps(), which re-verifies the approval gate and does
// the atomic multi-table write. This route only reports the real numbers
// back after the fact, it doesn't decide them.
export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabaseAuth = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: contractor } = await admin
      .from("contractors")
      .select("id, can_create_missions")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor?.can_create_missions) {
      return NextResponse.json(
        { error: "You're not yet approved to create your own missions." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      clientName,
      clientEmail,
      clientCompany,
      clientPhone,
      location,
      latitude,
      longitude,
      serviceType,
      distanceMiles,
      siteComplexity,
      urgency,
      deliverableTier,
    } = body;

    if (!clientName || !clientEmail || latitude == null || longitude == null || !serviceType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const airspaceResult = await classifyAirspace(latitude, longitude);
    const quoteInput: QuoteInput = {
      serviceType,
      distanceMiles: distanceMiles ?? 0,
      airspaceClass: airspaceResult.airspace_class,
      siteComplexity: siteComplexity ?? "simple",
      urgency: urgency ?? "standard",
      deliverableTier: deliverableTier ?? "standard",
    };
    const quote = calculateQuote(quoteInput);

    // Call the RPC as the pilot themselves (forwarding their own bearer
    // token) so auth.uid() resolves correctly inside the SECURITY DEFINER
    // function — not the service-role client, which has no bound user.
    // Note: no commissionCents/contractorCents in this payload — the RPC
    // computes the real split itself via calculate_commission_bps() and
    // ignores any caller-supplied split, so there's nothing to pre-guess.
    const { data: jobId, error: rpcError } = await supabaseAuth.rpc("pilot_create_own_mission", {
      p_client_name: clientName,
      p_client_email: clientEmail,
      p_client_company: clientCompany ?? null,
      p_location: location,
      p_latitude: latitude,
      p_longitude: longitude,
      p_service_type: serviceType,
      p_airspace_class: airspaceResult.airspace_class,
      p_scope: clientPhone ? `Phone: ${clientPhone}` : null,
      p_quote: {
        basePriceCents: quote.basePriceCents,
        locationMod: quote.modifiers.location.factor,
        airspaceMod: quote.modifiers.airspace.factor,
        complexityMod: quote.modifiers.complexity.factor,
        urgencyMod: quote.modifiers.urgency.factor,
        deliverableMod: quote.modifiers.deliverable.factor,
        combinedMultiplier: quote.combinedMultiplier,
        totalCents: quote.totalCents,
        warnings: quote.warnings,
      },
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // Report the real, persisted split — not a pre-guess.
    const { data: assignment } = await admin
      .from("mission_assignments")
      .select("contractor_payout_cents, dom_commission_cents, commission_bps_applied")
      .eq("job_id", jobId)
      .single();

    return NextResponse.json({
      jobId,
      quote: {
        serviceLabel: quote.serviceLabel,
        totalCents: quote.totalCents,
        contractorCents: assignment?.contractor_payout_cents ?? null,
        commissionCents: assignment?.dom_commission_cents ?? null,
        commissionBps: assignment?.commission_bps_applied ?? null,
        warnings: quote.warnings,
      },
    });
  } catch (e: any) {
    console.error("pilot mission create error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
