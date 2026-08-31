// lib/pilotAssetsPipeline.ts
// Pure, framework-free logic for pilot asset inventory + equipment-based
// mission eligibility (issue #15). Mirrors lib/mapperPipeline.ts's pattern:
// nothing here touches Supabase, so it's shared cleanly between the pilot
// UI, the API routes, the admin UI, and unit tests.

// ---------------------------------------------------------------------------
// Vocab — asset_type/status/capability have no DB constraint (same
// "unconstrained text, app array is the source of truth" convention as
// MAPPER_DELIVERABLE_TYPES in lib/mapperPipeline.ts), so adding a new type
// never needs a migration.
// ---------------------------------------------------------------------------

export const ASSET_TYPES = [
  { value: "uav", label: "UAV / Drone" },
  { value: "controller", label: "Controller" },
  { value: "camera_payload", label: "Camera / Payload" },
  { value: "rtk_gnss", label: "RTK / GNSS Equipment" },
  { value: "lidar_payload", label: "LiDAR Payload" },
  { value: "thermal_payload", label: "Thermal Payload" },
  { value: "battery", label: "Batteries" },
  { value: "generator", label: "Generator / Power System" },
  { value: "vehicle", label: "Vehicle / Trailer" },
  { value: "safety_equipment", label: "Safety Equipment" },
  { value: "lighting", label: "Lighting" },
  { value: "computer", label: "Computer / Processing Workstation" },
  { value: "connectivity", label: "Connectivity Equipment (Starlink / Hotspot)" },
  { value: "other", label: "Other" },
] as const;
export type AssetType = (typeof ASSET_TYPES)[number]["value"];

export const ASSET_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unavailable", label: "Unavailable" },
  { value: "retired", label: "Retired" },
] as const;
export type AssetStatus = (typeof ASSET_STATUS_OPTIONS)[number]["value"];

export const CAPABILITIES = [
  { value: "rgb_imagery", label: "RGB Imagery" },
  { value: "mapping_photogrammetry", label: "Mapping / Photogrammetry" },
  { value: "rtk", label: "RTK" },
  { value: "ppk", label: "PPK Capable" },
  { value: "thermal", label: "Thermal" },
  { value: "lidar", label: "LiDAR" },
  { value: "zoom_inspection", label: "Zoom Inspection" },
  { value: "low_light", label: "Low-Light" },
  { value: "video", label: "Video" },
  { value: "obstacle_avoidance", label: "Obstacle Avoidance" },
  { value: "survey_workflow", label: "Survey Workflow" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["value"];
export const CAPABILITY_LABELS: Record<string, string> = Object.fromEntries(CAPABILITIES.map((c) => [c.value, c.label]));

// Private fields: visible only to the owning pilot and admins, never on a
// public profile regardless of public_visible (see the migration's own
// comment on pilot_assets.public_visible).
export const PILOT_ASSET_PRIVATE_FIELDS = [
  "serial_number",
  "registration_number",
  "remote_id",
  "firmware_version",
  "acquired_at",
  "notes",
] as const;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface PilotAsset {
  id: string;
  contractor_id: string;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  display_name: string | null;
  serial_number: string | null;
  registration_number: string | null;
  remote_id: string | null;
  firmware_version: string | null;
  acquired_at: string | null;
  status: string;
  public_visible: boolean;
  public_description: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  capabilities_verified: boolean;
  capabilities_verified_at: string | null;
}

export interface PublicPilotAsset {
  id: string;
  asset_type: string;
  display_name: string | null;
  manufacturer: string | null;
  model: string | null;
  public_description: string | null;
  status: string;
  capabilities: string[];
}

// Server-side projection for anything that renders on a public profile —
// the ONLY function that should ever decide what leaves the private set.
// Returns null for an asset that isn't opted in or is archived (an
// archived asset shouldn't advertise capabilities the pilot no longer
// actively offers).
export function toPublicAsset(asset: Pick<PilotAsset, "id" | "asset_type" | "display_name" | "manufacturer" | "model" | "public_description" | "status" | "public_visible" | "archived_at">, capabilities: string[]): PublicPilotAsset | null {
  if (!asset.public_visible || asset.archived_at) return null;
  return {
    id: asset.id,
    asset_type: asset.asset_type,
    display_name: asset.display_name,
    manufacturer: asset.manufacturer,
    model: asset.model,
    public_description: asset.public_description,
    status: asset.status,
    capabilities,
  };
}

export function isAssetActive(asset: Pick<PilotAsset, "status" | "archived_at">): boolean {
  return asset.status === "active" && !asset.archived_at;
}

// ---------------------------------------------------------------------------
// Eligibility — the requirements a service_type carries (from
// mission_capability_requirements) vs. what a pilot's active assets unlock.
// Used identically client-side (queue display/explanation) and server-side
// (the actual enforcement gate) so the two can never silently drift.
// ---------------------------------------------------------------------------

export interface CapabilityRequirement {
  capability: string;
  required: boolean;
}

export type EligibilityFit = "eligible" | "partial" | "not_equipped";

export interface EligibilityResult {
  fit: EligibilityFit;
  eligible: boolean; // true for "eligible" and "partial" -- only "not_equipped" blocks a claim
  missingRequired: string[];
  missingOptional: string[];
}

export function activeCapabilitySet(assets: Pick<PilotAsset, "status" | "archived_at">[], capabilitiesByAssetIndex: string[][]): Set<string> {
  const set = new Set<string>();
  assets.forEach((asset, i) => {
    if (!isAssetActive(asset)) return;
    for (const capability of capabilitiesByAssetIndex[i] ?? []) set.add(capability);
  });
  return set;
}

export function computeEligibility(requirements: CapabilityRequirement[], activeCapabilities: Set<string>): EligibilityResult {
  const missingRequired = requirements.filter((r) => r.required && !activeCapabilities.has(r.capability)).map((r) => r.capability);
  const missingOptional = requirements.filter((r) => !r.required && !activeCapabilities.has(r.capability)).map((r) => r.capability);
  const fit: EligibilityFit = missingRequired.length > 0 ? "not_equipped" : missingOptional.length > 0 ? "partial" : "eligible";
  return { fit, eligible: fit !== "not_equipped", missingRequired, missingOptional };
}

// A missing configuration is not the same as a mission with no equipment
// requirements. Operational matching fails closed until DOM configures it.
export function computeConfiguredEligibility(requirements: CapabilityRequirement[], activeCapabilities: Set<string>): EligibilityResult {
  if (requirements.length === 0) {
    return { fit: "not_equipped", eligible: false, missingRequired: ["requirements_not_configured"], missingOptional: [] };
  }
  return computeEligibility(requirements, activeCapabilities);
}

export function eligibilityReason(result: EligibilityResult): string | null {
  if (result.fit === "eligible") return null;
  const labels = (keys: string[]) => keys.map((k) => CAPABILITY_LABELS[k] ?? k).join(", ");
  if (result.fit === "not_equipped") return `${labels(result.missingRequired)} required`;
  return `Optional: ${labels(result.missingOptional)}`;
}
