import { describe, expect, it } from "vitest";
import {
  deriveFieldOfView,
  genericWideRgbPayload,
  isPhotogrammetryPayload,
  type CameraPayloadProfile,
} from "@/lib/aircraft/payload";

describe("DOMINIC payload abstraction", () => {
  it("derives field of view from sensor and focal length", () => {
    const profile: CameraPayloadProfile = {
      id: "derived-camera",
      name: "Derived Camera",
      kind: "rgb",
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      focalLengthMm: 12,
      supportsPhoto: true,
      supportsVideo: true,
      supportsGimbalPitch: true,
    };
    const fov = deriveFieldOfView(profile);
    expect(fov.horizontalFovDeg).toBeGreaterThan(60);
    expect(fov.verticalFovDeg).toBeGreaterThan(50);
  });

  it("recognizes a wide RGB payload as usable for photogrammetry", () => {
    expect(isPhotogrammetryPayload(genericWideRgbPayload)).toBe(true);
    expect(deriveFieldOfView(genericWideRgbPayload).horizontalFovDeg).toBe(84);
  });

  it("does not treat lidar-only payloads as photo capture payloads", () => {
    expect(
      isPhotogrammetryPayload({
        id: "lidar",
        name: "LiDAR",
        kind: "lidar",
        supportsPhoto: false,
        supportsVideo: false,
        supportsGimbalPitch: false,
      }),
    ).toBe(false);
  });
});
