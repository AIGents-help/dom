import { describe, expect, it } from "vitest";
import {
  evaluateInspectionReadiness,
  INSPECTION_CAPABILITIES,
  mergeInspectionCapabilities,
  resolveCatalogCapabilities,
} from "@/lib/aircraft/inspectionCapabilities";

describe("DOMINIC inspection capability engine", () => {
  it("recognizes Matrice 4E as a strong visual/mapping platform without thermal", () => {
    const capabilities = resolveCatalogCapabilities({
      manufacturer: "DJI",
      model: "Matrice 4E",
    });
    const ids = capabilities.map((item) => item.capability);

    expect(ids).toContain(INSPECTION_CAPABILITIES.rgbImagery);
    expect(ids).toContain(INSPECTION_CAPABILITIES.mappingPhotogrammetry);
    expect(ids).toContain(INSPECTION_CAPABILITIES.zoomInspection);
    expect(ids).toContain(INSPECTION_CAPABILITIES.laserRangefinder);
    expect(ids).toContain(INSPECTION_CAPABILITIES.rtk);
    expect(ids).not.toContain(INSPECTION_CAPABILITIES.radiometricThermal);
  });

  it("requires a thermal-capable aircraft or payload for thermal inspection", () => {
    const capabilities = resolveCatalogCapabilities({
      manufacturer: "DJI",
      model: "Matrice 4E",
    });
    const readiness = evaluateInspectionReadiness({
      inspectionType: "thermal",
      capabilities,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequired).toEqual([
      INSPECTION_CAPABILITIES.radiometricThermal,
    ]);
  });

  it("recognizes Matrice 4T thermal metering capabilities", () => {
    const capabilities = resolveCatalogCapabilities({
      manufacturer: "DJI",
      model: "Matrice 4T",
    });
    const readiness = evaluateInspectionReadiness({
      inspectionType: "thermal",
      capabilities,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.available).toContain(INSPECTION_CAPABILITIES.thermalSpotMeter);
    expect(readiness.available).toContain(INSPECTION_CAPABILITIES.thermalAreaMeter);
  });

  it("supports unknown aircraft through inventory/payload capability declarations", () => {
    const capabilities = mergeInspectionCapabilities({
      identity: { manufacturer: "Third Party", model: "Unknown X" },
      inventoryCapabilities: ["rgb_imagery", "rtk"],
      payloadCapabilities: ["thermal", "laser_rangefinder"],
    });
    const readiness = evaluateInspectionReadiness({
      inspectionType: "thermal",
      capabilities,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.available).toContain(INSPECTION_CAPABILITIES.radiometricThermal);
    expect(readiness.available).toContain(INSPECTION_CAPABILITIES.laserRangefinder);
  });

  it("keeps legacy capability names compatible with the new canonical model", () => {
    const capabilities = mergeInspectionCapabilities({
      inventoryCapabilities: ["thermal", "photogrammetry", "zoom"],
    });
    const ids = capabilities.map((item) => item.capability);

    expect(ids).toContain(INSPECTION_CAPABILITIES.radiometricThermal);
    expect(ids).toContain(INSPECTION_CAPABILITIES.mappingPhotogrammetry);
    expect(ids).toContain(INSPECTION_CAPABILITIES.zoomInspection);
  });

  it("preserves custom third-party capabilities for future sensors", () => {
    const capabilities = mergeInspectionCapabilities({
      inventoryCapabilities: ["voc_sniffer_ppb", "custom-corrosion-probe"],
    });
    const ids = capabilities.map((item) => item.capability);

    expect(ids).toContain("voc_sniffer_ppb");
    expect(ids).toContain("custom_corrosion_probe");
  });
});
