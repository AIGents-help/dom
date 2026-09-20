import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { rateLimitResponse } from "@/lib/rateLimit";

async function getPilot(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const supabaseAuth = getSupabaseAnonServer(authHeader);
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };

  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin
    .from("contractors")
    .select("id,can_create_missions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contractor?.can_create_missions) {
    return { error: NextResponse.json({ error: "Not approved for self-service mission creation" }, { status: 403 }) };
  }

  return { admin, contractor };
}

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const auth = await getPilot(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const {
      draftId,
      clientName,
      clientEmail,
      clientCompany,
      clientPhone,
      location,
      latitude,
      longitude,
      airspace,
      travelOrigin,
      distanceMiles,
      serviceType,
      customMissionTitle,
      customMissionScope,
      customDeliverables,
      siteComplexity,
      urgency,
      deliverableTier,
      billingMode,
      noChargeReason,
      quote,
    } = body;

    if (!clientName?.trim() || !clientEmail?.trim() || !location?.trim() || latitude == null || longitude == null || !serviceType || !quote) {
      return NextResponse.json({ error: "Draft is missing required mission details." }, { status: 400 });
    }

    if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) {
      return NextResponse.json({ error: "Draft requires a verified travel distance." }, { status: 400 });
    }

    if (billingMode !== "paid" && billingMode !== "no_charge") {
      return NextResponse.json({ error: "Invalid billing mode." }, { status: 400 });
    }

    if (billingMode === "no_charge" && !noChargeReason?.trim()) {
      return NextResponse.json({ error: "No-charge drafts require a reason." }, { status: 400 });
    }

    const payload = {
      contractor_id: auth.contractor.id,
      client_name: clientName.trim(),
      client_email: clientEmail.trim().toLowerCase(),
      client_company: clientCompany?.trim() || null,
      client_phone: clientPhone?.trim() || null,
      location: location.trim(),
      latitude,
      longitude,
      airspace: airspace ?? null,
      travel_origin: travelOrigin?.trim() || null,
      distance_miles: distanceMiles,
      service_type: serviceType,
      custom_mission_title: customMissionTitle?.trim() || null,
      custom_mission_scope: customMissionScope?.trim() || null,
      custom_deliverables: customDeliverables?.trim() || null,
      site_complexity: siteComplexity ?? "simple",
      urgency: urgency ?? "standard",
      deliverable_tier: deliverableTier ?? "standard",
      billing_mode: billingMode,
      no_charge_reason: billingMode === "no_charge" ? noChargeReason.trim() : null,
      quote,
      updated_at: new Date().toISOString(),
    };

    if (draftId) {
      const { data, error } = await auth.admin
        .from("pilot_mission_drafts")
        .update(payload)
        .eq("id", draftId)
        .eq("contractor_id", auth.contractor.id)
        .select("id,updated_at")
        .maybeSingle();

      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      return NextResponse.json({ draft: data });
    }

    const { data, error } = await auth.admin
      .from("pilot_mission_drafts")
      .insert(payload)
      .select("id,updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ draft: data });
  } catch (error: any) {
    console.error("[pilot mission draft] save failed", error);
    return NextResponse.json({ error: error.message ?? "Failed to save draft." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const auth = await getPilot(req);
  if ("error" in auth) return auth.error;

  try {
    const draftId = req.nextUrl.searchParams.get("id");
    if (!draftId) return NextResponse.json({ error: "Draft id required." }, { status: 400 });

    const { error } = await auth.admin
      .from("pilot_mission_drafts")
      .delete()
      .eq("id", draftId)
      .eq("contractor_id", auth.contractor.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[pilot mission draft] delete failed", error);
    return NextResponse.json({ error: error.message ?? "Failed to delete draft." }, { status: 500 });
  }
}
