import { describe, expect, it } from "vitest";
import { buildAutonomousCheckpoints, buildCaptureSequence, calculateObjectScanPlan, evaluateCaptureGuidance, signedAngularDelta } from "./capturePlanner";

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

  it("computes shortest signed angular guidance across north", () => {
    expect(signedAngularDelta(2, 358)).toBe(4);
    expect(signedAngularDelta(358, 2)).toBe(-4);
  });

  it("marks a checkpoint capture-ready only inside all tolerances", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 8,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });
    const checkpoint = buildCaptureSequence(plan)[0];

    const ready = evaluateCaptureGuidance(checkpoint, {
      bearingDeg: checkpoint.bearingDeg + 2,
      distanceFt: checkpoint.radiusFt - 1,
      cameraAngle: checkpoint.cameraAngle + 1,
    });
    expect(ready.ready).toBe(true);

    const notReady = evaluateCaptureGuidance(checkpoint, {
      bearingDeg: checkpoint.bearingDeg + 20,
      distanceFt: checkpoint.radiusFt,
      cameraAngle: checkpoint.cameraAngle,
    });
    expect(notReady.ready).toBe(false);
    expect(notReady.instruction).toContain("counter-clockwise");
  });

  it("exports the same manual checkpoints for a future autonomous layer", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 8,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });
    const manual = buildCaptureSequence(plan);
    const autonomous = buildAutonomousCheckpoints(plan);

    expect(autonomous).toHaveLength(manual.length);
    expect(autonomous[0]).toMatchObject({
      id: manual[0].id,
      bearingDeg: manual[0].bearingDeg,
      radiusFt: manual[0].radiusFt,
      cameraAngle: manual[0].cameraAngle,
      action: "capture_photo",
    });
  });

});
