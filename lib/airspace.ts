// lib/airspace.ts
// Airspace classification service for DOM Mission Control.
// Given a lat/lng, returns airspace class, max altitude, nearby airports,
// TFRs, authorization requirements, and risk level.
//
// Integration path:
// - Phase 2 MVP: FAA UAS Facility Map data via OpenAIP or AirMap tile queries
// - Phase 2 full: Airspace Link AirHub API (REST, sandbox available)
// - Phase 3: Aloft API for direct LAANC submission from within DOM
//
// Until the API key is configured, the system uses a rule-based estimation
// from airport proximity data (surprisingly accurate for Class D/G determination).

export interface AirspaceResult {
  airspace_class: "B" | "C" | "D" | "E" | "G" | "RESTRICTED" | "UNKNOWN";
  max_altitude_ft: number;
  nearest_airport: {
    icao: string;
    name: string;
    distance_nm: number;
    bearing: string;
    tower_controlled: boolean;
  } | null;
  laanc_required: boolean;
  laanc_status: "not_required" | "required" | "available" | "unavailable";
  tfr_active: boolean;
  tfr_details: string[];
  notams: string[];
  risk_level: "low" | "moderate" | "elevated" | "high";
  authorization_summary: string;
  raw_source: "airhub_api" | "faa_estimate" | "manual";
  queried_at: string;
}

// ── Airspace Link AirHub API integration ──
// Docs: https://airspacelink.com/developers
// Set AIRHUB_API_KEY in env to enable. Without it, falls back to airport-proximity estimation.

export async function classifyAirspace(
  lat: number,
  lng: number
): Promise<AirspaceResult> {
  const apiKey = process.env.AIRHUB_API_KEY;

  if (apiKey) {
    return classifyViaAirHub(lat, lng, apiKey);
  }

  // Fallback: airport-proximity estimation using public data
  return classifyViaEstimation(lat, lng);
}

// ── AirHub API path (primary, when key is configured) ──
async function classifyViaAirHub(
  lat: number,
  lng: number,
  apiKey: string
): Promise<AirspaceResult> {
  try {
    // AirHub Advisories endpoint — returns airspace data for a point
    const url = `https://airhub-api.airspacelink.com/v1/advisories?latitude=${lat}&longitude=${lng}&altitude=400`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error("AirHub API error:", res.status, await res.text());
      return classifyViaEstimation(lat, lng);
    }

    const data = await res.json();
    return parseAirHubResponse(data, lat, lng);
  } catch (err) {
    console.error("AirHub API call failed, falling back to estimation:", err);
    return classifyViaEstimation(lat, lng);
  }
}

function parseAirHubResponse(data: any, lat: number, lng: number): AirspaceResult {
  // AirHub returns advisory layers — extract the relevant ones.
  // This parsing adapts to their response schema; update if their API evolves.
  const advisories = data?.advisories ?? data?.data ?? [];

  let airspaceClass: AirspaceResult["airspace_class"] = "G";
  let maxAlt = 400;
  let laancRequired = false;
  let riskLevel: AirspaceResult["risk_level"] = "low";
  const tfrs: string[] = [];
  const notams: string[] = [];
  let nearestAirport: AirspaceResult["nearest_airport"] = null;

  for (const adv of advisories) {
    const type = (adv.type ?? adv.advisoryType ?? "").toLowerCase();

    if (type.includes("airspace") || type.includes("controlled")) {
      const cls = (adv.properties?.airspaceClass ?? adv.airspaceClass ?? "").toUpperCase();
      if (["B", "C", "D", "E"].includes(cls)) {
        airspaceClass = cls as AirspaceResult["airspace_class"];
        laancRequired = true;
        riskLevel = cls === "B" ? "high" : cls === "C" ? "elevated" : "moderate";
      }
      if (adv.properties?.ceiling || adv.ceiling) {
        maxAlt = Math.min(maxAlt, adv.properties?.ceiling ?? adv.ceiling ?? 400);
      }
    }

    if (type.includes("tfr")) {
      tfrs.push(adv.description ?? adv.properties?.description ?? "Active TFR");
    }

    if (type.includes("notam")) {
      notams.push(adv.description ?? adv.properties?.description ?? "Active NOTAM");
    }

    if (type.includes("airport") || type.includes("heliport")) {
      const dist = adv.properties?.distance_nm ?? adv.distance ?? null;
      if (dist !== null && (!nearestAirport || dist < nearestAirport.distance_nm)) {
        nearestAirport = {
          icao: adv.properties?.icao ?? adv.icao ?? "UNKN",
          name: adv.properties?.name ?? adv.name ?? "Unknown",
          distance_nm: dist,
          bearing: adv.properties?.bearing ?? "",
          tower_controlled: adv.properties?.towered ?? false,
        };
      }
    }
  }

  return {
    airspace_class: airspaceClass,
    max_altitude_ft: maxAlt,
    nearest_airport: nearestAirport,
    laanc_required: laancRequired,
    laanc_status: laancRequired ? "required" : "not_required",
    tfr_active: tfrs.length > 0,
    tfr_details: tfrs,
    notams,
    risk_level: riskLevel,
    authorization_summary: buildAuthSummary(airspaceClass, laancRequired, tfrs.length > 0),
    raw_source: "airhub_api",
    queried_at: new Date().toISOString(),
  };
}

// ── Fallback: airport-proximity estimation ──
// Uses the Overpass/Nominatim approach to find nearby airports, then estimates
// airspace class from airport type and distance. Surprisingly accurate for
// the G vs. controlled determination that drives 80% of mission planning.

interface AirportInfo {
  icao: string;
  name: string;
  lat: number;
  lng: number;
  type: string; // "large_airport" | "medium_airport" | "small_airport" | "heliport"
}

// OSM doesn't carry an OurAirports-style size field, and most fields — even
// small towered ones — carry an icao/iata code, so absence of data isn't
// evidence of "uncontrolled." Default any aerodrome we can't positively
// identify as a major hub to "medium" (LAANC caution) rather than "small"
// (no authorization) — an unflagged towered field is a worse failure mode
// than an unnecessary LAANC check.
function estimateAirportType(tags: Record<string, string | undefined>): string {
  const aerodrome = (tags?.aerodrome ?? "").toLowerCase();
  return aerodrome === "international" ? "large_airport" : "medium_airport";
}

async function classifyViaEstimation(lat: number, lng: number): Promise<AirspaceResult> {
  let nearestAirport: AirspaceResult["nearest_airport"] = null;
  let airspaceClass: AirspaceResult["airspace_class"] = "G";
  let maxAlt = 400;
  let laancRequired = false;
  let riskLevel: AirspaceResult["risk_level"] = "low";

  try {
    // Query Overpass API for airports within ~10nm (~18.5km).
    // Real airports are usually mapped as ways/relations (runway polygons),
    // not bare nodes, so search all element types via `nwr` and ask for
    // `center` coordinates. Overpass also requires an identifying
    // User-Agent — requests without one are rejected with 406.
    const radiusM = 18500;
    const query = `[out:json][timeout:10];(nwr["aeroway"="aerodrome"](around:${radiusM},${lat},${lng}););out center tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "dom-mission-control/1.0 (airspace estimation fallback)",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const airports: AirportInfo[] = (data.elements ?? [])
        .filter((el: any) => (el.lat ?? el.center?.lat) != null && (el.lon ?? el.center?.lon) != null)
        .map((el: any) => ({
          icao: el.tags?.icao ?? el.tags?.ref ?? el.tags?.["faa"] ?? "UNKN",
          name: el.tags?.name ?? "Unknown Airport",
          lat: el.lat ?? el.center.lat,
          lng: el.lon ?? el.center.lon,
          type: estimateAirportType(el.tags ?? {}),
        }));

      if (airports.length > 0) {
        // Classify against every airport in range and keep the most
        // restrictive result — the geometrically nearest field isn't
        // necessarily the one that matters (e.g. a small strip 9nm away
        // can be closer than a major Class B hub 12nm away, but the hub
        // is what actually governs the airspace).
        const severity: Record<string, number> = { B: 4, C: 3, D: 2, E: 1, G: 0 };

        let nearestDist = Infinity;
        let nearestAirportInfo: AirportInfo | null = null;

        let bestClass: AirspaceResult["airspace_class"] = "G";
        let bestRisk: AirspaceResult["risk_level"] = "low";
        let bestAirportInfo: AirportInfo | null = null;
        let bestDist = Infinity;

        for (const ap of airports) {
          const d = haversineNm(lat, lng, ap.lat, ap.lng);
          if (d < nearestDist) {
            nearestDist = d;
            nearestAirportInfo = ap;
          }

          let cls: AirspaceResult["airspace_class"] = "G";
          let risk: AirspaceResult["risk_level"] = "low";
          // Estimate airspace class from airport type + distance.
          // This is a simplification — real boundaries are irregular, but
          // it catches the critical cases (operating near towered airports).
          if (ap.type === "large_airport") {
            if (d < 5) { cls = "B"; risk = "high"; }
            else if (d < 10) { cls = "C"; risk = "elevated"; }
          } else if (d < 5) {
            cls = "D"; risk = "moderate";
          }

          if (severity[cls] > severity[bestClass]) {
            bestClass = cls;
            bestRisk = risk;
            bestAirportInfo = ap;
            bestDist = d;
          }
        }

        const reportAirport = bestAirportInfo ?? nearestAirportInfo;
        const reportDist = bestAirportInfo ? bestDist : nearestDist;

        if (reportAirport) {
          const bearing = calcBearing(lat, lng, reportAirport.lat, reportAirport.lng);
          nearestAirport = {
            icao: reportAirport.icao,
            name: reportAirport.name,
            distance_nm: Math.round(reportDist * 10) / 10,
            bearing,
            tower_controlled: reportAirport.type === "large_airport" || reportAirport.type === "medium_airport",
          };
        }

        airspaceClass = bestClass;
        riskLevel = bestRisk;

        if (["B", "C", "D"].includes(airspaceClass)) {
          laancRequired = true;
          // UASFM grid ceilings vary; use conservative defaults
          if (airspaceClass === "B") maxAlt = 0; // generally no auto-approval
          else if (airspaceClass === "C") maxAlt = 200;
          else if (airspaceClass === "D") maxAlt = 200;
        }
      }
    } else {
      console.error("Overpass API error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Airport proximity lookup failed:", err);
  }

  return {
    airspace_class: airspaceClass,
    max_altitude_ft: maxAlt,
    nearest_airport: nearestAirport,
    laanc_required: laancRequired,
    laanc_status: laancRequired ? "required" : "not_required",
    tfr_active: false, // can't check TFRs without FAA API
    tfr_details: [],
    notams: [],
    risk_level: riskLevel,
    authorization_summary: buildAuthSummary(airspaceClass, laancRequired, false),
    raw_source: "faa_estimate",
    queried_at: new Date().toISOString(),
  };
}

// ── Helpers ──

function buildAuthSummary(cls: string, laanc: boolean, tfr: boolean): string {
  const parts: string[] = [];
  if (cls === "G") parts.push("Class G uncontrolled airspace — no authorization required.");
  else if (cls === "B") parts.push("Class B airspace — LAANC authorization required. Auto-approval unlikely; further coordination may be needed.");
  else if (cls === "C") parts.push("Class C airspace — LAANC authorization required before flight.");
  else if (cls === "D") parts.push("Class D airspace — LAANC authorization required before flight.");
  else if (cls === "E") parts.push("Class E surface area — LAANC authorization may be required.");
  if (tfr) parts.push("ACTIVE TFR — flight may be prohibited. Review details before proceeding.");
  if (!laanc && !tfr && cls === "G") parts.push("Standard Part 107 rules apply.");
  return parts.join(" ");
}

function haversineNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const brng = ((toDeg(Math.atan2(y, x)) + 360) % 360);
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(brng / 45) % 8];
}

function toRad(d: number) { return d * Math.PI / 180; }
function toDeg(r: number) { return r * 180 / Math.PI; }
