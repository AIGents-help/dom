import { describe, expect, it } from "vitest";
import {
  calculateFovDeg,
  payloadFootprintWidthFt,
  payloadGroundSampleDistanceInchesPerPixel,
  resolvePayloadGeometry,
  type CameraPayloadProfile,
} from "@/lib/aircraft/payload";

describe("DOMINIC payload geometry", () => {
  const payload: CameraPayloadProfile = {
    id: "test-camera",
    label: "Test Camera",
    kind: "rgb",
    imageWidthPx: 4000,
    imageHeightPx: 3000,
    sensorWidthMm: 13.2,
    sensorHeightMm: 8.8,
    focalLengthMm: 8.8,
    supportsPhoto: true,
    supportsVideo: true,
  };

  it("derives field of view from sensor and focal length", () => {
    const horizontal = calculateFovDeg(13.2, 8.8);
    expect(horizontal).toBeGreaterThan(70);
    expect(horizontal).toBeLessThan(80);

    const geometry = resolvePayloadGeometry(payload);
    expect(geometry.horizontalFovDeg).toBeCloseTo(horizontal, 6);
    expect(geometry.verticalFovDeg).toBeDefined();
  });

  it("uses explicit FOV when the payload reports calibrated geometry", () => {
    const geometry = resolvePayloadGeometry({
      ...payload,
      horizontalFovDeg: 82.5,
    });
    expect(geometry.horizontalFovDeg).toBe(82.5);
  });

  it("calculates image footprint and GSD from connected payload geometry", () => {
    const footprint = payloadFootprintWidthFt(20, payload);
    const gsd = payloadGroundSampleDistanceInchesPerPixel(20, payload);

    expect(footprint).toBeGreaterThan(20);
    expect(gsd).not.toBeNull();
    expect(gsd as number).toBeGreaterThan(0);
  });
});
