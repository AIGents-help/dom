import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMissionRequestEmails } from "@/lib/resend";
import { createNotionMissionRequest } from "@/lib/notion";
import { classifyAirspace } from "@/lib/airspace";
import { calculateQuote, type QuoteInput } from "@/lib/quoting";
import { rateLimitResponse } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const body = await req.json();

    // Two callers share this endpoint with different naming conventions:
    // the public mission-request form (contactName/details/preferredDate)
    // and the admin Create Mission wizard (requester_name/scope, plus
    // lat/lng + airspace_class from the auto-classification step). Accept
    // either shape and normalize to the mission_requests schema.
    const contactName = body.contactName ?? body.requester_name;
    const contactEmail = body.contactEmail ?? body.requester_email;
    const contactPhone = body.contactPhone;
    const company = body.company;
    const industry = body.industry;
    const serviceType = body.serviceType ?? body.service_type;
    const location = body.location;
    const budgetRange = body.budgetRange ?? body.budget_range;
    const latitude = body.latitude;
    const longitude = body.longitude;
    let airspaceClass = body.airspace_class;
    const timeline = body.timeline;
    const scope = [body.details ?? body.scope, contactPhone ? `Phone: ${contactPhone}` : null]
      .filter(Boolean)
      .join("\n\n") || undefined;

    // The admin Create Mission wizard sends its full quote breakdown (from
    // lib/quoting.ts's calculateQuote) alongside the request so it can be
    // persisted rather than thrown away after the review step. Trusting a
    // client-supplied total lets any caller fabricate a price, though — when
    // the raw scoping inputs are present instead (the public quote wizard
    // always sends these), recompute server-side and ignore body.quote
    // entirely, making the server the sole source of truth for money.
    type QuoteShape = {
      serviceType?: string;
      basePriceCents?: number;
      modifiers?: Record<string, { factor: number; label: string }>;
      combinedMultiplier?: number;
      totalCents?: number;
      commissionCents?: number;
      contractorPayoutCents?: number;
      warnings?: string[];
    };

    let quote: QuoteShape | undefined = body.quote;

    const rawInput: QuoteInput | null =
      serviceType != null &&
      latitude != null &&
      longitude != null &&
      body.distanceMiles != null &&
      body.siteComplexity != null &&
      body.urgency != null &&
      body.deliverableTier != null
        ? {
            serviceType,
            distanceMiles: body.distanceMiles,
            airspaceClass: "G", // overwritten below once classified
            siteComplexity: body.siteComplexity,
            urgency: body.urgency,
            deliverableTier: body.deliverableTier,
          }
        : null;

    if (rawInput) {
      const airspaceResult = await classifyAirspace(latitude, longitude);
      airspaceClass = airspaceResult.airspace_class;
      quote = calculateQuote({ ...rawInput, airspaceClass });
    }

    if (!contactName || !contactEmail) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    // 1. Persist to Supabase
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("mission_requests")
        .insert({
          requester_name: contactName,
          requester_email: contactEmail,
          company,
          industry,
          service_type: serviceType,
          location,
          latitude,
          longitude,
          airspace_class: airspaceClass,
          timeline,
          scope,
          budget_range: budgetRange,
          quoted_amount_cents: quote?.totalCents ?? null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Supabase insert failed:", insertError);
      } else if (inserted && quote) {
        const { error: quoteError } = await supabaseAdmin.from("quotes").insert({
          mission_request_id: inserted.id,
          service_type: quote.serviceType ?? serviceType,
          base_price_cents: quote.basePriceCents ?? 0,
          location_mod: quote.modifiers?.location?.factor ?? 1,
          airspace_mod: quote.modifiers?.airspace?.factor ?? 1,
          complexity_mod: quote.modifiers?.complexity?.factor ?? 1,
          urgency_mod: quote.modifiers?.urgency?.factor ?? 1,
          deliverable_mod: quote.modifiers?.deliverable?.factor ?? 1,
          combined_multiplier: quote.combinedMultiplier ?? 1,
          total_cents: quote.totalCents ?? 0,
          commission_cents: quote.commissionCents ?? 0,
          contractor_cents: quote.contractorPayoutCents ?? 0,
          warnings: quote.warnings ?? [],
        });
        if (quoteError) console.error("Quote insert failed:", quoteError);
      }
    } catch (e) {
      console.error("Supabase insert failed:", e);
    }

    // 2. Sync to Notion CRM (if configured)
    try {
      await createNotionMissionRequest({
        contactName,
        contactEmail,
        company,
        industry,
        serviceType,
        details: scope,
      });
    } catch (e) {
      console.error("Notion sync failed:", e);
    }

    // 3. Send email notifications (if configured)
    try {
      if (process.env.RESEND_API_KEY) {
        await sendMissionRequestEmails({
          contactName,
          contactEmail,
          company,
          industry,
          serviceType,
          details: scope,
        });
      }
    } catch (e) {
      console.error("Resend email failed:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission request error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
