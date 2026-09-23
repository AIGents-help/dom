import { describe, expect, it } from "vitest";
import {
  calculateBuildingPlan,
  calculateCorridorPlan,
  calculateFacadePlan,
  calculateInteriorPlan,
  calculateRoofPlan,
  calculateStockpilePlan,
  georeferencePattern,
} from "@/lib/capturePatterns";

describe("DOMINIC multi-mission capture geometry", () => {
  it("builds a serpentine roof grid with optional obliques", () => {
    const plan = calculateRoofPlan({
      lengthFt: 80,
      widthFt: 50,
      altitudeFt: 60,
      frontOverlapPct: 75,
      sideOverlapPct: 70,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
      includeObliques: true,
    });
    expect(plan.missionType).toBe("roof");
    expect(plan.passCount).toBeGreaterThan(1);
    expect(plan.checkpoints.some((p) => p.passId === "perimeter-oblique")).toBe(true);
    expect(plan.checkpoints.every((p) => p.action === "capture_photo")).toBe(true);
  });

  it("builds facade passes across width and height", () => {
    const plan = calculateFacadePlan({
      widthFt: 120,
      heightFt: 60,
      standoffFt: 30,
      overlapPct: 75,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
    });
    expect(plan.missionType).toBe("facade");
    expect(plan.passCount).toBeGreaterThan(1);
    expect(new Set(plan.checkpoints.map((p) => p.relativeAltitudeFt)).size).toBeGreaterThan(1);
  });

  it("builds corridor lanes along the full route", () => {
    const plan = calculateCorridorPlan({
      lengthFt: 1000,
      widthFt: 80,
      altitudeFt: 100,
      frontOverlapPct: 75,
      sideOverlapPct: 65,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
    });
    expect(plan.missionType).toBe("corridor");
    expect(plan.checkpoints.length).toBeGreaterThan(10);
    expect(plan.passCount).toBeGreaterThanOrEqual(2);
  });

  it("adds perimeter obliques to stockpile coverage", () => {
    const plan = calculateStockpilePlan({
      lengthFt: 100,
      widthFt: 80,
      pileHeightFt: 25,
      altitudeAboveTopFt: 50,
      overlapPct: 75,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
    });
    expect(plan.missionType).toBe("stockpile");
    expect(plan.checkpoints.filter((p) => p.passId === "perimeter-oblique")).toHaveLength(8);
  });

  it("builds stacked building orbits", () => {
    const plan = calculateBuildingPlan({
      lengthFt: 100,
      widthFt: 60,
      heightFt: 80,
      standoffFt: 35,
      overlapPct: 75,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
    });
    expect(plan.missionType).toBe("building");
    expect(plan.passCount).toBeGreaterThan(1);
    expect(plan.checkpoints.length).toBeGreaterThan(plan.passCount);
  });

  it("builds interior room loops and warns that GNSS alone is insufficient", () => {
    const plan = calculateInteriorPlan({
      lengthFt: 30,
      widthFt: 20,
      heightFt: 10,
      wallStandoffFt: 4,
    });
    expect(plan.missionType).toBe("interior");
    expect(plan.passCount).toBe(2);
    expect(plan.warnings.join(" ")).toContain("SLAM");
  });

  it("georeferences local capture geometry around a subject center", () => {
    const plan = calculateFacadePlan({
      widthFt: 30,
      heightFt: 20,
      standoffFt: 15,
      overlapPct: 75,
      horizontalFovDeg: 84,
      verticalFovDeg: 60,
    });
    const geo = georeferencePattern(plan, 39.95, -75.16, 90);
    expect(geo).toHaveLength(plan.checkpoints.length);
    expect(geo.some((p) => p.latitude !== 39.95 || p.longitude !== -75.16)).toBe(true);
  });
});
