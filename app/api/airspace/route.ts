import { NextRequest, NextResponse } from "next/server";
import { classifyAirspace } from "@/lib/airspace";
import {
  calculateQuote,
  toPublicQuote,
  type QuoteInput,
  type QuoteBreakdown,
  type PublicQuoteBreakdown,
  type SiteComplexity,
  type UrgencyLevel,
  type DeliverableTier,
} from "@/lib/quoting";
import { isAdminRequest } from "@/lib/authz";
import { rateLimitResponse } from "@/lib/rateLimit";

// GET /api/airspace?lat=33.95&lng=-117.39
// Returns airspace classification for the given coordinates.
// Optionally include quoting params to get an instant quote.
//
// Full quote: /api/airspace?lat=33.95&lng=-117.39&service=roof_inspection_commercial
//   &distance=25&complexity=moderate&urgency=standard&deliverable=standard

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const p = req.nextUrl.searchParams;
  const lat = parseFloat(p.get("lat") ?? "");
  const lng = parseFloat(p.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const airspace = await classifyAirspace(lat, lng);

    // If service type is provided, calculate a quote too
    const serviceType = p.get("service");
    let quote: QuoteBreakdown | PublicQuoteBreakdown | null = null;

    if (serviceType) {
      const input: QuoteInput = {
        serviceType,
        distanceMiles: parseFloat(p.get("distance") ?? "0"),
        airspaceClass: airspace.airspace_class,
        siteComplexity: (p.get("complexity") as SiteComplexity) ?? "simple",
        urgency: (p.get("urgency") as UrgencyLevel) ?? "standard",
        deliverableTier: (p.get("deliverable") as DeliverableTier) ?? "standard",
        customBaseCents: p.get("custom_base") ? parseInt(p.get("custom_base")!) : undefined,
      };
      const fullQuote = calculateQuote(input);
      quote = (await isAdminRequest(req)) ? fullQuote : toPublicQuote(fullQuote);
    }

    return NextResponse.json({ airspace, quote });
  } catch (err: any) {
    console.error("airspace classification error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
