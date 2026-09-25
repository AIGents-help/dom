// lib/airspace.ts
// Airspace classification service for DOM Mission Control.
// Given a lat/lng, returns airspace class, max altitude, nearby airports,
// TFRs, authorization requirements, and risk level.
//
// Operational classification is sourced directly from FAA-published Class
// Airspace and UAS Facility Map datasets. If either source cannot establish a
// safe result, DOM fails closed rather than estimating from airport distance.
// TFR/NOTAM review remains a separate preflight requirement.

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
  const direct = normalized.match(/(?:CLASS\s*)?\b([BCDG])\b/);
  if (direct && ["B", "C", "D", "G"].includes(direct[1])) {
    return direct[1] as AirspaceResult["airspace_class"];
  }
  if (/(?:CLASS\s*)?\bE\d*\b/.test(normalized)) return "E";
  return null;
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

interface ArcGisFeatureResponse {
  features?: ArcGisFeature[];
  error?: unknown;
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

  let uasfmData: ArcGisFeatureResponse | null = null;
  let classData: ArcGisFeatureResponse | null = null;

  if (uasfmResponse.status === "fulfilled" && uasfmResponse.value.ok) {
    uasfmData = await uasfmResponse.value.json().catch(() => null) as ArcGisFeatureResponse | null;
  }
  if (classResponse.status === "fulfilled" && classResponse.value.ok) {
    classData = await classResponse.value.json().catch(() => null) as ArcGisFeatureResponse | null;
  }

  const uasfmFeatures: ArcGisFeature[] = Array.isArray(uasfmData?.features) ? uasfmData.features : [];
  const classFeatures: ArcGisFeature[] = Array.isArray(classData?.features) ? classData.features : [];
  const uasfmClasses = uasfmFeatures.flatMap((feature) =>
    [1, 2, 3, 4, 5]
      .map((index) => normalizeClass(feature?.attributes?.[`AIRSPACE_${index}`]))
      .filter((value): value is AirspaceResult["airspace_class"] => value !== null)
  );

  const surfaceClasses = classFeatures.flatMap((feature) => {
    const attrs = feature?.attributes ?? {};
    const cls = normalizeClass(attrs.CLASS);
    if (!cls) return [];
    const lowerText = `${attrs.LOWER_DESC ?? ""} ${attrs.LOWER_CODE ?? ""}`.toUpperCase();
    const surfaceBased = lowerText.includes("SFC") || lowerText.includes("SURFACE") || (attrs.LOWER_VAL != null && Number(attrs.LOWER_VAL) === 0);
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
    .map((feature) => Number(feature?.attributes?.CEILING))
    .filter((value: number) => Number.isFinite(value) && value >= 0);
  const maxAlt = ceilings.length ? Math.min(...ceilings) : 400;
  const controlled = ["B", "C", "D", "E"].includes(airspaceClass);
  const laancEnabled = uasfmFeatures.some((feature) =>
    [1, 2, 3, 4, 5].some((index) => {
      const attrs: Record<string, unknown> = feature?.attributes ?? {};
      return Number(attrs[`APT${index}_LAANC`]) === 1
        || String(attrs[`APT${index}_Enabled`] ?? "").toLowerCase().includes("enabled");
    })
  );
  return {
    airspace_class: airspaceClass,
    max_altitude_ft: controlled ? (uasfmFeatures.length ? maxAlt : 0) : 400,
    nearest_airport: null,
    laanc_required: controlled,
    laanc_status: controlled ? (uasfmFeatures.length ? (laancEnabled ? "available" : "required") : "unavailable") : "not_required",
    tfr_active: false,
    tfr_details: [],
    notams: [],
    risk_level: airspaceClass === "B" ? "high" : airspaceClass === "C" ? "elevated" : controlled ? "moderate" : "low",
    authorization_summary: buildAuthSummary(airspaceClass, controlled, false),
    raw_source: "faa_official",
    operationally_verified: true,
    data_warning: uasfmFeatures.length
      ? "FAA Class Airspace and UAS Facility Map checked. TFRs and NOTAMs still require a current preflight check."
      : "FAA airspace class verified, but no UAS Facility Map grid was returned. Do not infer an authorization altitude; verify LAANC eligibility/ceiling separately before flight.",
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
