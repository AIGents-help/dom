import { describe, expect, it } from "vitest";
import {
  decideRealtimeInspectionScreening,
  realtimeScreeningReasonLabel,
} from "@/lib/dominicRealtimeScreening";

describe("DOMINIC realtime inspection screening policy", () => {
  it("auto-screens usable RGB visual inspection images", () => {
    expect(
      decideRealtimeInspectionScreening({
        hasInspectionContext: true,
        inspectionType: "visual",
        sensorMode: "rgb",
        mediaType: "image",
        qualityUsable: true,
      }),
    ).toEqual({ screen: true, reason: "eligible" });
  });

  it("auto-screens zoom evidence for visual inspection", () => {
    expect(
      decideRealtimeInspectionScreening({
        hasInspectionContext: true,
        inspectionType: "visual",
        sensorMode: "zoom",
        mediaType: "image",
        qualityUsable: true,
      }).screen,
    ).toBe(true);
  });

  it("does not run per-frame visual AI over mapping or stockpile capture", () => {
    for (const inspectionType of ["mapping", "stockpile", "construction"]) {
      expect(
        decideRealtimeInspectionScreening({
          hasInspectionContext: true,
          inspectionType,
          sensorMode: "rgb",
          mediaType: "image",
          qualityUsable: true,
        }).screen,
      ).toBe(false);
    }
  });

  it("keeps thermal and gas evidence out of the RGB visual model", () => {
    for (const sensorMode of ["thermal", "gas", "lidar", "multispectral"]) {
      expect(
        decideRealtimeInspectionScreening({
          hasInspectionContext: true,
          inspectionType: "visual",
          sensorMode,
          mediaType: "image",
          qualityUsable: true,
        }).reason,
      ).toBe("unsupported_sensor");
    }
  });

  it("does not auto-screen a poor-quality capture", () => {
    expect(
      decideRealtimeInspectionScreening({
        hasInspectionContext: true,
        inspectionType: "roof",
        sensorMode: "rgb",
        mediaType: "image",
        qualityUsable: false,
      }).reason,
    ).toBe("poor_capture_quality");
  });

  it("provides operator-facing reason text", () => {
    expect(realtimeScreeningReasonLabel("unsupported_sensor")).toContain("sensor");
  });
});
