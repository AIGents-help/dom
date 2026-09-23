import { describe, expect, it } from "vitest";
import { buildCaptureSequence, calculateObjectScanPlan } from "./capturePlanner";

describe("DOMINIC capture planner", () => {
  it("builds three complete object-scan rings", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 12,
      objectHeightFt: 10,
      standoffFt: 18,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });

    expect(plan.rings).toHaveLength(3);
    expect(plan.totalShots).toBeGreaterThanOrEqual(36);
    expect(plan.totalShots).toBe(plan.rings.reduce((sum, ring) => sum + ring.shots, 0));
  });

  it("creates one guided checkpoint per planned frame", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 8,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });

    const sequence = buildCaptureSequence(plan);
    expect(sequence).toHaveLength(plan.totalShots);
    expect(sequence[0].bearingDeg).toBe(0);
    expect(sequence.some((shot) => shot.ringId === "high")).toBe(true);
  });

  it("flags low-overlap plans", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 8,
      standoffFt: 20,
      overlapPct: 55,
      horizontalFovDeg: 84,
    });

    expect(plan.warnings.some((warning) => warning.includes("70%"))).toBe(true);
  });
});
