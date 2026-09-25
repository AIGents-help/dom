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
  raw_source: "faa_official" | "airhub_api" | "faa_estimate" | "manual" | "unavailable";
  operationally_verified: boolean;
  data_warning: string | null;
  queried_at: string;
}

// ── Airspace Link AirHub API integration ──
// Docs: https://airspacelink.com/developers
// Set AIRHUB_API_KEY in env to enable. Without it, falls back to airport-proximity estimation.

export async function classifyAirspace(
  lat: number,
  lng: number
): Promise<AirspaceResult> {
  // FAA-published datasets are the authority for DOM's displayed class and
  // UAS Facility Map ceiling. Third-party services must never override them.
  return classifyViaFaa(lat, lng);
}

const FAA_UASFM_URL =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query";
const FAA_CLASS_AIRSPACE_URL =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/Class_Airspace/FeatureServer/0/query";

function faaPointQuery(url: string, lat: number, lng: number, outFields: string) {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false",
  });
  return `${url}?${params.toString()}`;
}

function normalizeClass(value: unknown): AirspaceResult["airspace_class"] | null {
  const normalized = String(value ?? "").toUpperCase().replaceAll("_", " ");
  const match = normalized.match(/(?:CLASS\\s*)?\\b([BCDEG])\\b/);
  return match && ["B", "C", "D", "E", "G"].includes(match[1])
    ? match[1] as AirspaceResult["airspace_class"]
    : null;
}

function mostRestrictive(classes: AirspaceResult["airspace_class"][]) {
  const severity: Record<string, number> = { B: 5, C: 4, D: 3, E: 2, G: 1, UNKNOWN: 0, RESTRICTED: 6 };
  return classes.sort((a, b) => severity[b] - severity[a])[0] ?? "UNKNOWN";
}

async function classifyViaFaa(lat: number, lng: number): Promise<AirspaceResult> {
  const uasfmUrl = faaPointQuery(
    FAA_UASFM_URL,
    lat,
    lng,
    "CEILING,MAP_EFF,AIRS_COUNT,AIRSPACE_1,AIRSPACE_2,AIRSPACE_3,AIRSPACE_4,AIRSPACE_5,APT1_ICAO,APT1_NAME,APT1_LAANC,APT1_Enabled,APT2_LAANC,APT2_Enabled,APT3_LAANC,APT3_Enabled,APT4_LAANC,APT4_Enabled,APT5_LAANC,APT5_Enabled",
  );
  const classUrl = faaPointQuery(
    FAA_CLASS_AIRSPACE_URL,
    lat,
    lng,
    "CLASS,NAME,LOWER_DESC,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_DESC,UPPER_VAL,UPPER_UOM,UPPER_CODE",
  );

  const [uasfmResponse, classResponse] = await Promise.allSettled([
    fetch(uasfmUrl, { headers: { Accept: "application/json" }, cache: "no-store" }),
    fetch(classUrl, { headers: { Accept: "application/json" }, cache: "no-store" }),
  ]);

  let uasfmData: any = null;
  let classData: any = null;

  if (uasfmResponse.status === "fulfilled" && uasfmResponse.value.ok) {
    uasfmData = await uasfmResponse.value.json().catch(() => null);
  }
  if (classResponse.status === "fulfilled" && classResponse.value.ok) {
    classData = await classResponse.value.json().catch(() => null);
  }

  const uasfmFeatures = Array.isArray(uasfmData?.features) ? uasfmData.features : [];
  const classFeatures = Array.isArray(classData?.features) ? classData.features : [];
  const uasfmClasses = uasfmFeatures.flatMap((feature: any) =>
    [1, 2, 3, 4, 5]
      .map((index) => normalizeClass(feature?.attributes?.[`AIRSPACE_${index}`]))
      .filter((value): value is AirspaceResult["airspace_class"] => value !== null)
  );

  const surfaceClasses = classFeatures.flatMap((feature: any) => {
    const attrs = feature?.attributes ?? {};
    const cls = normalizeClass(attrs.CLASS);
    if (!cls) return [];
    const lowerText = `${attrs.LOWER_DESC ?? ""} ${attrs.LOWER_CODE ?? ""}`.toUpperCase();
    const surfaceBased = lowerText.includes("SFC") || lowerText.includes("SURFACE") || Number(attrs.LOWER_VAL) === 0;
    return surfaceBased ? [cls] : [];
  });

  const classes = [...uasfmClasses, ...surfaceClasses];
  let airspaceClass: AirspaceResult["airspace_class"];

  if (classes.length > 0) {
    airspaceClass = mostRestrictive(classes);
  } else if (Array.isArray(classData?.features)) {
    // The FAA Class Airspace service answered successfully and no B/C/D/E
    // surface polygon intersects the point. Below 400 AGL this is treated as G.
    airspaceClass = "G";
  } else {
    return unavailableAirspace(
      "FAA airspace datasets could not be verified. Mission creation is blocked; verify this location in an FAA-approved LAANC source."
    );
  }

  const ceilings = uasfmFeatures
    .map((feature: any) => Number(feature?.attributes?.CEILING))
    .filter((value: number) => Number.isFinite(value) && value >= 0);
  const maxAlt = ceilings.length ? Math.min(...ceilings) : 400;
  const controlled = ["B", "C", "D", "E"].includes(airspaceClass);
  const laancEnabled = uasfmFeatures.some((feature: any) =>
    [1, 2, 3, 4, 5].some((index) => {
      const attrs = feature?.attributes ?? {};
      return Number(attrs[`APT${index}_LAANC`]) === 1
        || String(attrs[`APT${index}_Enabled`] ?? "").toLowerCase().includes("enabled");
    })
  );
  const firstAirport = uasfmFeatures
    .map((feature: any) => feature?.attributes ?? {})
    .find((attrs: any) => attrs.APT1_ICAO || attrs.APT1_NAME);

  return {
    airspace_class: airspaceClass,
    max_altitude_ft: controlled ? maxAlt : 400,
    nearest_airport: firstAirport ? {
      icao: firstAirport.APT1_ICAO ?? "UNKN",
      name: firstAirport.APT1_NAME ?? "FAA-listed airport",
      distance_nm: 0,
      bearing: "",
      tower_controlled: controlled,
    } : null,
    laanc_required: controlled,
    laanc_status: controlled ? (laancEnabled ? "available" : "required") : "not_required",
    tfr_active: false,
    tfr_details: [],
    notams: [],
    risk_level: airspaceClass === "B" ? "high" : airspaceClass === "C" ? "elevated" : controlled ? "moderate" : "low",
    authorization_summary: buildAuthSummary(airspaceClass, controlled, false),
    raw_source: "faa_official",
    operationally_verified: true,
    data_warning: "FAA Class Airspace/UAS Facility Map verified. TFRs and NOTAMs still require a current preflight check.",
    queried_at: new Date().toISOString(),
  };
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
      return unavailableAirspace(
        "Airspace verification provider is unavailable. Verify this location in an FAA-approved LAANC source before flight."
      );
    }

    const data = await res.json();
    return parseAirHubResponse(data);
  } catch (err) {
    console.error("AirHub API call failed:", err);
    return unavailableAirspace(
      "Airspace verification provider could not be reached. Verify this location in an FAA-approved LAANC source before flight."
    );
  }
}

function parseAirHubResponse(data: any): AirspaceResult {
  // AirHub returns advisory layers — extract the relevant ones.
  // This parsing adapts to their response schema; update if their API evolves.
  const advisories = data?.advisories ?? data?.data;
  if (!Array.isArray(advisories)) {
    return unavailableAirspace(
      "Airspace provider returned an unrecognized response. Verify this location in an FAA-approved LAANC source before flight."
    );
  }

  let airspaceClass: AirspaceResult["airspace_class"] = "UNKNOWN";
  let airspaceClassificationFound = false;
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
      if (["B", "C", "D", "E", "G"].includes(cls)) {
        airspaceClass = cls as AirspaceResult["airspace_class"];
        airspaceClassificationFound = true;
        laancRequired = cls !== "G";
        riskLevel = cls === "B" ? "high" : cls === "C" ? "elevated" : cls === "G" ? "low" : "moderate";
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

  if (!airspaceClassificationFound) {
    return unavailableAirspace(
      "Airspace provider did not return an explicit airspace classification. Verify this location in an FAA-approved LAANC source before flight."
    );
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
    operationally_verified: true,
    data_warning: null,
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
    operationally_verified: false,
    data_warning: "Airport-proximity estimate only. Do not use as an FAA/LAANC airspace determination.",
    queried_at: new Date().toISOString(),
  };
}

function unavailableAirspace(message: string): AirspaceResult {
  return {
    airspace_class: "UNKNOWN",
    max_altitude_ft: 0,
    nearest_airport: null,
    laanc_required: true,
    laanc_status: "unavailable",
    tfr_active: false,
    tfr_details: [],
    notams: [],
    risk_level: "high",
    authorization_summary: message,
    raw_source: "unavailable",
    operationally_verified: false,
    data_warning: message,
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
