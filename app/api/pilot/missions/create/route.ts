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
      customMissionTitle,
      customMissionScope,
      customDeliverables,
      customBaseCents,
      travelDistanceSource,
      billingMode = "paid",
      noChargeReason,
      uninsuredAcknowledged,
    } = body;

    const admin = getSupabaseAdmin();
    const { data: contractor } = await admin
      .from("contractors")
      .select("id, can_create_missions, insurance_verified, insurance_expires_on, uninsured_self_service_eligible")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor?.can_create_missions) {
      return NextResponse.json(
        { error: "You're not yet approved to create your own missions." },
        { status: 403 }
      );
    }

    const personalInsuranceCurrent = !!contractor.insurance_verified
      && !!contractor.insurance_expires_on
      && new Date(`${contractor.insurance_expires_on}T23:59:59Z`).getTime() > Date.now();

    if (!personalInsuranceCurrent) {
      if (!contractor.uninsured_self_service_eligible) {
        return NextResponse.json(
          { error: "A current verified insurance policy or Admin-authorized uninsured self-service path is required." },
          { status: 409 }
        );
      }
      if (uninsuredAcknowledged !== true) {
        return NextResponse.json(
          { error: "Accept the per-mission uninsured responsibility acknowledgement before creating this mission." },
          { status: 409 }
        );
      }
    }

    if (!clientName || !clientEmail || latitude == null || longitude == null || !serviceType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (travelDistanceSource !== "pilot_google_maps_verified" || !Number.isFinite(distanceMiles) || distanceMiles <= 0) {
      return NextResponse.json({ error: "Pilot-created missions require a verified one-way Google Maps driving distance." }, { status: 400 });
    }

    if (serviceType === "custom" && (
      !customMissionTitle?.trim() || !customMissionScope?.trim()
    )) {
      return NextResponse.json({ error: "Custom missions require a title and mission objective." }, { status: 400 });
    }

    if (billingMode !== "paid" && billingMode !== "no_charge") {
      return NextResponse.json({ error: "Invalid billing mode." }, { status: 400 });
    }

    if (billingMode === "no_charge" && !noChargeReason?.trim()) {
      return NextResponse.json({ error: "No-charge missions require a reason." }, { status: 400 });
    }

    const airspaceResult = await classifyAirspace(latitude, longitude);
    const quoteInput: QuoteInput = {
      serviceType,
      distanceMiles: distanceMiles ?? 0,
      airspaceClass: airspaceResult.airspace_class,
      siteComplexity: siteComplexity ?? "simple",
      urgency: urgency ?? "standard",
      deliverableTier: deliverableTier ?? "standard",
      customBaseCents: serviceType === "custom" && Number.isFinite(customBaseCents) && customBaseCents > 0 ? customBaseCents : undefined,
    };
    const referenceQuote = calculateQuote(quoteInput);
    const isNoCharge = billingMode === "no_charge";
    const quote = isNoCharge
      ? {
          ...referenceQuote,
          totalCents: 0,
          commissionCents: 0,
          contractorPayoutCents: 0,
          warnings: [
            ...referenceQuote.warnings,
            `No-charge mission: ${noChargeReason.trim().replaceAll("_", " ")}.`,
          ],
        }
      : referenceQuote;

    // The service-only transaction receives the verified actor ID from this
    // route; the browser cannot invoke it or choose another actor.
    // Note: no commissionCents/contractorCents in this payload — the RPC
    // computes the real split itself via calculate_commission_bps() and
    // ignores any caller-supplied split, so there's nothing to pre-guess.
    const { data: jobId, error: rpcError } = await admin.rpc("pilot_create_own_mission_service", {
      p_actor_user_id: user.id,
      p_client_name: clientName,
      p_client_email: clientEmail,
      p_client_company: clientCompany ?? null,
      p_location: location,
      p_latitude: latitude,
      p_longitude: longitude,
      p_service_type: serviceType,
      p_airspace_class: airspaceResult.airspace_class,
      p_scope: serviceType === "custom"
        ? `${customMissionTitle.trim()}\n\nObjective:\n${customMissionScope.trim()}\n\nDeliverables:\n${customDeliverables?.trim() || "DOM to determine appropriate deliverables from the mission objective and selected deliverable tier."}${clientPhone ? `\n\nClient phone: ${clientPhone}` : ""}\n\nTravel: ${distanceMiles} one-way driving miles (${travelDistanceSource === "pilot_google_maps_verified" ? "pilot verified in Google Maps" : "unverified"})`
        : `${clientPhone ? `Phone: ${clientPhone}\n\n` : ""}Travel: ${distanceMiles} one-way driving miles (${travelDistanceSource === "pilot_google_maps_verified" ? "pilot verified in Google Maps" : "unverified"})`,
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
        billingMode,
        noChargeReason: isNoCharge ? noChargeReason.trim() : null,
        referenceTotalCents: referenceQuote.totalCents,
        travelDistanceMiles: distanceMiles,
        travelDistanceSource,
        uninsuredAcknowledged: !personalInsuranceCurrent && uninsuredAcknowledged === true,
        uninsuredTermsVersion: "pilot-uninsured-responsibility-v1",
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
        referenceTotalCents: referenceQuote.totalCents,
        billingMode,
        noChargeReason: isNoCharge ? noChargeReason.trim() : null,
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
