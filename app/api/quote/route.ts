import { NextRequest, NextResponse } from "next/server";
import { calculateQuote, quoteToSummary, toPublicQuote, SERVICE_BASE_PRICES, type QuoteInput } from "@/lib/quoting";
import { classifyAirspace } from "@/lib/airspace";
import { isAdminRequest } from "@/lib/authz";

// POST /api/quote
// Body: { serviceType, lat, lng, distanceMiles, siteComplexity, urgency, deliverableTier, customBaseCents? }
// Returns full quote breakdown with automatic airspace classification.
//
// GET /api/quote/services
// Returns available service types and base prices.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serviceType, lat, lng, distanceMiles, siteComplexity, urgency, deliverableTier, customBaseCents } = body;

    if (!serviceType) {
      return NextResponse.json({ error: "serviceType required" }, { status: 400 });
    }

    // Auto-classify airspace if coordinates provided
    let airspaceClass: QuoteInput["airspaceClass"] = body.airspaceClass ?? "G";
    let airspaceData = null;

    if (lat != null && lng != null) {
      airspaceData = await classifyAirspace(lat, lng);
      airspaceClass = airspaceData.airspace_class;
    }

    const input: QuoteInput = {
      serviceType,
      distanceMiles: distanceMiles ?? 0,
      airspaceClass,
      siteComplexity: siteComplexity ?? "simple",
      urgency: urgency ?? "standard",
      deliverableTier: deliverableTier ?? "standard",
      customBaseCents,
    };

    const quote = calculateQuote(input);
    const isAdmin = await isAdminRequest(req);

    if (!isAdmin) {
      return NextResponse.json({ quote: toPublicQuote(quote), airspace: airspaceData, summary: null });
    }

    const summary = quoteToSummary(quote);
    return NextResponse.json({ quote, airspace: airspaceData, summary });
  } catch (err: any) {
    console.error("quote error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  // Return available service types for the frontend
  const services = Object.entries(SERVICE_BASE_PRICES).map(([key, val]) => ({
    id: key,
    label: val.label,
    basePriceCents: val.cents,
    basePrice: `$${(val.cents / 100).toFixed(2)}`,
  }));

  return NextResponse.json({ services });
}
