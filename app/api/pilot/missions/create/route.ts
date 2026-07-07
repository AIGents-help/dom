import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { classifyAirspace } from "@/lib/airspace";
import { calculateQuote, type QuoteInput } from "@/lib/quoting";
import { rateLimitResponse } from "@/lib/rateLimit";

// POST /api/pilot/missions/create
// Lets an approved pilot (contractors.can_create_missions = true) create and
// immediately self-assign their own mission — they source the client, so
// there's no separate "offer" step. Money is computed here server-side (the
// same server-authoritative principle as /api/mission-request) and only the
// final numbers are handed to pilot_create_own_mission, which re-verifies
// the approval gate itself and does the atomic multi-table write.
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
      .select("id, can_create_missions, subscription_active")
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

    // The one place subscription status changes the money math: a
    // subscribed pilot keeps the full total, DOM's revenue comes from the
    // flat monthly fee instead of a per-mission cut.
    const commissionCents = contractor.subscription_active ? 0 : quote.commissionCents;
    const contractorCents = contractor.subscription_active ? quote.totalCents : quote.contractorPayoutCents;

    // Call the RPC as the pilot themselves (forwarding their own bearer
    // token) so auth.uid() resolves correctly inside the SECURITY DEFINER
    // function — not the service-role client, which has no bound user.
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
        commissionCents,
        contractorCents,
        warnings: quote.warnings,
      },
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({
      jobId,
      quote: {
        serviceLabel: quote.serviceLabel,
        totalCents: quote.totalCents,
        contractorCents,
        commissionCents,
        warnings: quote.warnings,
      },
    });
  } catch (e: any) {
    console.error("pilot mission create error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
