import { describe, it, expect } from "vitest";
import {
  computeEligibility, eligibilityReason, toPublicAsset, isAssetActive, activeCapabilitySet,
  ASSET_TYPES, CAPABILITIES, PILOT_ASSET_PRIVATE_FIELDS,
  type CapabilityRequirement, type PilotAsset,
} from "./pilotAssetsPipeline";

describe("vocab", () => {
  it("has no duplicate asset types or capabilities", () => {
    expect(new Set(ASSET_TYPES.map((a) => a.value)).size).toBe(ASSET_TYPES.length);
    expect(new Set(CAPABILITIES.map((c) => c.value)).size).toBe(CAPABILITIES.length);
  });
  it("private fields never include public-safe display fields", () => {
    expect(PILOT_ASSET_PRIVATE_FIELDS).not.toContain("display_name");
    expect(PILOT_ASSET_PRIVATE_FIELDS).not.toContain("public_description");
    expect(PILOT_ASSET_PRIVATE_FIELDS).toContain("serial_number");
    expect(PILOT_ASSET_PRIVATE_FIELDS).toContain("registration_number");
  });
});

describe("isAssetActive", () => {
  it("requires status active and not archived", () => {
    expect(isAssetActive({ status: "active", archived_at: null })).toBe(true);
    expect(isAssetActive({ status: "maintenance", archived_at: null })).toBe(false);
    expect(isAssetActive({ status: "active", archived_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("activeCapabilitySet", () => {
  it("only counts capabilities from active, non-archived assets", () => {
    const assets = [
      { status: "active", archived_at: null },
      { status: "maintenance", archived_at: null },
      { status: "active", archived_at: "2026-01-01T00:00:00Z" },
    ];
    const caps = [["rtk", "rgb_imagery"], ["thermal"], ["lidar"]];
    const set = activeCapabilitySet(assets, caps);
    expect(set).toEqual(new Set(["rtk", "rgb_imagery"]));
  });
});

describe("computeEligibility", () => {
  const reqs: CapabilityRequirement[] = [
    { capability: "mapping_photogrammetry", required: true },
    { capability: "rtk", required: false },
  ];

  it("is eligible when every required and optional capability is present", () => {
    const result = computeEligibility(reqs, new Set(["mapping_photogrammetry", "rtk"]));
    expect(result).toEqual({ fit: "eligible", eligible: true, missingRequired: [], missingOptional: [] });
  });

  it("is partial when only an optional capability is missing", () => {
    const result = computeEligibility(reqs, new Set(["mapping_photogrammetry"]));
    expect(result.fit).toBe("partial");
    expect(result.eligible).toBe(true);
    expect(result.missingOptional).toEqual(["rtk"]);
  });

  it("is not_equipped when a required capability is missing, even if optional ones are present", () => {
    const result = computeEligibility(reqs, new Set(["rtk"]));
    expect(result.fit).toBe("not_equipped");
    expect(result.eligible).toBe(false);
    expect(result.missingRequired).toEqual(["mapping_photogrammetry"]);
  });

  it("is eligible with no requirements at all (e.g. custom missions)", () => {
    const result = computeEligibility([], new Set());
    expect(result.fit).toBe("eligible");
  });
});

describe("eligibilityReason", () => {
  it("returns null when eligible", () => {
    expect(eligibilityReason({ fit: "eligible", eligible: true, missingRequired: [], missingOptional: [] })).toBeNull();
  });
  it("names the missing required capability", () => {
    const reason = eligibilityReason({ fit: "not_equipped", eligible: false, missingRequired: ["thermal"], missingOptional: [] });
    expect(reason).toBe("Thermal required");
  });
  it("names the missing optional capability distinctly from a blocking one", () => {
    const reason = eligibilityReason({ fit: "partial", eligible: true, missingRequired: [], missingOptional: ["rtk"] });
    expect(reason).toBe("Optional: RTK");
  });
});

describe("toPublicAsset", () => {
  const base: Pick<PilotAsset, "id" | "asset_type" | "display_name" | "manufacturer" | "model" | "public_description" | "status" | "public_visible" | "archived_at"> = {
    id: "a1", asset_type: "uav", display_name: "Matrice 4E", manufacturer: "DJI", model: "M4E",
    public_description: "Mapping drone", status: "active", public_visible: true, archived_at: null,
  };

  it("returns a public projection when opted in and not archived", () => {
    const result = toPublicAsset(base, ["mapping_photogrammetry", "rtk"]);
    expect(result).toEqual({
      id: "a1", asset_type: "uav", display_name: "Matrice 4E", manufacturer: "DJI", model: "M4E",
      public_description: "Mapping drone", status: "active", capabilities: ["mapping_photogrammetry", "rtk"],
    });
  });

  it("returns null when not opted in", () => {
    expect(toPublicAsset({ ...base, public_visible: false }, [])).toBeNull();
  });

  it("returns null when archived even if public_visible", () => {
    expect(toPublicAsset({ ...base, archived_at: "2026-01-01T00:00:00Z" }, [])).toBeNull();
  });

  it("never includes a private field key in its output shape", () => {
    const result = toPublicAsset(base, []);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).not.toContain("serial_number");
    expect(Object.keys(result!)).not.toContain("registration_number");
    expect(Object.keys(result!)).not.toContain("notes");
  });
});
