import { describe, expect, it } from "vitest";
import { assessStructuredMissionAssets } from "./missionEquipmentGuidance";

describe("structured mission equipment compatibility", () => {
  it("blocks a commercial UAV without FAA registration", () => {
    const [result] = assessStructuredMissionAssets("aerial_images", [{
      asset_type: "uav",
      manufacturer: "DJI",
      model: "Avata 2",
      registration_number: null,
      capabilities: ["rgb_imagery", "video"],
    }]);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/FAA registration/i);
  });

  it("accepts a registered Avata 2 for standard aerial media", () => {
    const [result] = assessStructuredMissionAssets("aerial_images", [{
      asset_type: "uav",
      manufacturer: "DJI",
      model: "Avata 2",
      registration_number: "FA3TEST123",
      capabilities: ["rgb_imagery", "video"],
    }]);
    expect(result.compatible).toBe(true);
  });

  it("uses structured capability data for mapping missions", () => {
    const results = assessStructuredMissionAssets("ortho_survey", [
      {
        asset_type: "uav",
        display_name: "Matrice 4E",
        registration_number: "FA3M4E",
        capabilities: ["rgb_imagery", "mapping_photogrammetry", "rtk", "survey_workflow"],
      },
      {
        asset_type: "uav",
        display_name: "Avata 2",
        registration_number: "FA3AVATA",
        capabilities: ["rgb_imagery", "video"],
      },
    ]);
    expect(results.find((item) => item.aircraft === "Matrice 4E")?.compatible).toBe(true);
    expect(results.find((item) => item.aircraft === "Avata 2")?.compatible).toBe(false);
  });

  it("ignores non-UAV equipment when building aircraft choices", () => {
    const results = assessStructuredMissionAssets("aerial_images", [{
      asset_type: "controller",
      display_name: "DJI RC Plus",
      registration_number: null,
      capabilities: [],
    }]);
    expect(results).toEqual([]);
  });
});
