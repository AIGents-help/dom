import { describe, expect, it } from "vitest";
import {
  assessCoverage,
  buildRepairPlan,
  summarizeCoverageByRing,
} from "@/lib/captureCoverage";
import {
  buildGeographicCheckpoints,
  calculateObjectScanPlan,
  destinationPoint,
} from "@/lib/capturePlanner";

function makeObjectScan() {
  const plan = calculateObjectScanPlan({
    objectDiameterFt: 12,
    objectHeightFt: 10,
    standoffFt: 18,
    overlapPct: 75,
    horizontalFovDeg: 84,
  });
  const checkpoints = buildGeographicCheckpoints({
    plan,
    centerLatitude: 39.95,
    centerLongitude: -75.16,
    objectHeightFt: 10,
    baseRelativeAltitudeFt: 5,
  });
  return { plan, checkpoints };
}

describe("DOMINIC adaptive coverage engine", () => {
  it("marks exact checkpoint captures as covered", () => {
    const { checkpoints } = makeObjectScan();
    const observations = checkpoints.slice(0, 3).map((checkpoint, index) => ({
      id: `capture-${index + 1}`,
      checkpointId: checkpoint.id,
      capturedAtMs: index + 1,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      relativeAltitudeFt: checkpoint.relativeAltitudeFt,
      cameraAngle: checkpoint.cameraAngle,
      sharpnessScore: 0.9,
      exposureScore: 0.95,
      usable: true,
    }));

    const coverage = assessCoverage({
      checkpoints: checkpoints.slice(0, 3),
      observations,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
    });

    expect(coverage.covered).toBe(3);
    expect(coverage.missing).toBe(0);
    expect(coverage.coveragePct).toBe(100);
  });

  it("marks low-quality imagery weak even when geometry is correct", () => {
    const { checkpoints } = makeObjectScan();
    const checkpoint = checkpoints[0];

    const coverage = assessCoverage({
      checkpoints: [checkpoint],
      observations: [{
        id: "soft-image",
        checkpointId: checkpoint.id,
        capturedAtMs: 1,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        relativeAltitudeFt: checkpoint.relativeAltitudeFt,
        cameraAngle: checkpoint.cameraAngle,
        sharpnessScore: 0.6,
        exposureScore: 0.9,
      }],
      centerLatitude: 39.95,
      centerLongitude: -75.16,
    });

    expect(coverage.weak).toBe(1);
    expect(coverage.coveragePct).toBe(50);
  });

  it("marks captures with poor geometry as missing", () => {
    const { checkpoints } = makeObjectScan();
    const checkpoint = checkpoints[0];
    const farAway = destinationPoint({
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      bearingDeg: 90,
      distanceFt: 80,
    });

    const coverage = assessCoverage({
      checkpoints: [checkpoint],
      observations: [{
        id: "wrong-position",
        checkpointId: checkpoint.id,
        capturedAtMs: 1,
        latitude: farAway.latitude,
        longitude: farAway.longitude,
        relativeAltitudeFt: checkpoint.relativeAltitudeFt + 20,
        cameraAngle: checkpoint.cameraAngle + 25,
        sharpnessScore: 1,
        exposureScore: 1,
      }],
      centerLatitude: 39.95,
      centerLongitude: -75.16,
    });

    expect(coverage.missing).toBe(1);
  });

  it("builds a minimal repair list containing only weak and missing views", () => {
    const { checkpoints } = makeObjectScan();
    const observations = checkpoints.slice(0, 4).map((checkpoint, index) => ({
      id: `capture-${index + 1}`,
      checkpointId: checkpoint.id,
      capturedAtMs: index + 1,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      relativeAltitudeFt: checkpoint.relativeAltitudeFt,
      cameraAngle: checkpoint.cameraAngle,
      sharpnessScore: index === 3 ? 0.6 : 0.9,
      exposureScore: 0.95,
    }));

    const subset = checkpoints.slice(0, 6);
    const coverage = assessCoverage({
      checkpoints: subset,
      observations,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
    });
    const repairs = buildRepairPlan({
      checkpoints: subset,
      coverage,
      includeWeak: true,
    });

    expect(repairs).toHaveLength(3);
    expect(repairs.filter((repair) => repair.priority === 2)).toHaveLength(2);
    expect(repairs.filter((repair) => repair.priority === 1)).toHaveLength(1);
  });

  it("summarizes weak and missing coverage by ring", () => {
    const { checkpoints } = makeObjectScan();
    const subset = checkpoints.slice(0, 8);
    const coverage = assessCoverage({
      checkpoints: subset,
      observations: [],
      centerLatitude: 39.95,
      centerLongitude: -75.16,
    });
    const rings = summarizeCoverageByRing(subset, coverage);

    expect(Object.values(rings).reduce((sum, ring) => sum + ring.missing, 0)).toBe(8);
  });
});
