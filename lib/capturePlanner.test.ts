import { describe, expect, it } from "vitest";
import { bearingInSector, buildAutonomousCheckpoints, buildCaptureSequence, buildGeographicCheckpoints, calculateObjectScanPlan, destinationPoint, evaluateCaptureGuidance, signedAngularDelta, validateMissionCalibration } from "./capturePlanner";

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


  it("projects a northbound checkpoint to a higher latitude", () => {
    const projected = destinationPoint({
      latitude: 39.95,
      longitude: -75.16,
      bearingDeg: 0,
      distanceFt: 100,
    });
    expect(projected.latitude).toBeGreaterThan(39.95);
    expect(Math.abs(projected.longitude + 75.16)).toBeLessThan(0.00001);
  });

  it("georeferences every object-scan checkpoint and applies ring altitude", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 20,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });
    const geographic = buildGeographicCheckpoints({
      plan,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      objectHeightFt: 20,
      baseRelativeAltitudeFt: 5,
    });

    expect(geographic).toHaveLength(plan.totalShots);
    expect(geographic[0].latitude).not.toBe(39.95);
    expect(geographic[0].relativeAltitudeFt).toBeGreaterThanOrEqual(5);
    expect(geographic.some((point) => point.ringId === "high" && point.relativeAltitudeFt > 20)).toBe(true);
  });


  it("handles no-fly sectors that cross north", () => {
    expect(bearingInSector(355, 350, 20)).toBe(true);
    expect(bearingInSector(10, 350, 20)).toBe(true);
    expect(bearingInSector(180, 350, 20)).toBe(false);
  });

  it("blocks launch when checkpoints violate calibration constraints", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 20,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });
    const checkpoints = buildGeographicCheckpoints({
      plan,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      objectHeightFt: 20,
      baseRelativeAltitudeFt: 5,
    });

    const validation = validateMissionCalibration({
      checkpoints,
      calibration: {
        homeLatitude: 39.9501,
        homeLongitude: -75.1601,
        minRelativeAltitudeFt: 0,
        maxRelativeAltitudeFt: 200,
        minStandoffFt: 10,
        maxStandoffFt: 100,
        noFlySectors: [{ id: "road", label: "Road", startBearingDeg: 350, endBearingDeg: 20 }],
      },
    });

    expect(validation.ready).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "no_fly_sector:road")).toBe(true);
  });

  it("passes calibration when all checkpoints are inside the safe envelope", () => {
    const plan = calculateObjectScanPlan({
      objectDiameterFt: 10,
      objectHeightFt: 20,
      standoffFt: 20,
      overlapPct: 75,
      horizontalFovDeg: 84,
    });
    const checkpoints = buildGeographicCheckpoints({
      plan,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      objectHeightFt: 20,
      baseRelativeAltitudeFt: 5,
    });

    const validation = validateMissionCalibration({
      checkpoints,
      calibration: {
        homeLatitude: 39.9501,
        homeLongitude: -75.1601,
        minRelativeAltitudeFt: 0,
        maxRelativeAltitudeFt: 200,
        minStandoffFt: 10,
        maxStandoffFt: 100,
        noFlySectors: [],
      },
    });

    expect(validation.ready).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

});
