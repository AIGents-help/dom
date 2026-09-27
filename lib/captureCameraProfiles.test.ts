import { describe, expect, it } from "vitest";
import { deriveVerticalFovDeg, resolveCaptureCameraProfile } from "./captureCameraProfiles";

describe("DOMINIC capture camera catalog", () => {
  it("recognizes the Matrice 4E wide camera", () => {
    const profile = resolveCaptureCameraProfile({
      manufacturer: "DJI",
      model: "Matrice 4E",
      display_name: "Primary mapping aircraft",
    });
    expect(profile).not.toBeNull();
    expect(profile?.horizontalFovDeg).toBe(84);
    expect(profile?.verticalFovDeg).toBeCloseTo(68.1, 1);
    expect(profile?.mappingRecommended).toBe(true);
  });

  it("recognizes Mavic 3 Enterprise aliases", () => {
    expect(resolveCaptureCameraProfile({ model: "M3E" })?.horizontalFovDeg).toBe(84);
    expect(resolveCaptureCameraProfile({ model: "Mavic 3 Thermal" })?.horizontalFovDeg).toBe(84);
  });

  it("does not guess optics for payload-dependent or unknown aircraft", () => {
    expect(resolveCaptureCameraProfile({ model: "Matrice 350 RTK" })).toBeNull();
    expect(resolveCaptureCameraProfile({ model: "Custom Heavy Lift UAV" })).toBeNull();
  });

  it("derives vertical field of view from horizontal FOV and image aspect ratio", () => {
    expect(deriveVerticalFovDeg(84, 4, 3)).toBeCloseTo(68.1, 1);
    expect(deriveVerticalFovDeg(0, 4, 3)).toBeNull();
  });
});
