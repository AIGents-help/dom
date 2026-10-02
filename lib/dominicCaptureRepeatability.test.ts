import { describe, expect, it } from "vitest";
import { assessCaptureRepeatability } from "@/lib/dominicCaptureRepeatability";

describe("capture repeatability", () => {
  it("scores a closely repeated camera setup as comparable", () => {
    const baseline = {
      cameraSource: "zoom",
      zoomRatio: 3,
      focusTarget: { x: 0.5, y: 0.5 },
      aeLocked: true,
      headingDeg: 180,
      gimbalPitchDeg: -30,
    };
    const current = {
      cameraSource: "zoom",
      zoomRatio: 3.2,
      focusTarget: { x: 0.54, y: 0.48 },
      aeLocked: true,
      headingDeg: 186,
      gimbalPitchDeg: -34,
    };
    const result = assessCaptureRepeatability({ current, baseline });
    expect(result.comparable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.warnings).toHaveLength(0);
  });

  it("flags materially different capture geometry and optics", () => {
    const baseline = {
      cameraSource: "zoom",
      zoomRatio: 4,
      focusTarget: { x: 0.4, y: 0.4 },
      aeLocked: true,
      headingDeg: 90,
      gimbalPitchDeg: -20,
    };
    const current = {
      cameraSource: "wide",
      zoomRatio: 1,
      focusTarget: { x: 0.8, y: 0.8 },
      aeLocked: false,
      headingDeg: 140,
      gimbalPitchDeg: -45,
    };
    const result = assessCaptureRepeatability({ current, baseline });
    expect(result.comparable).toBe(false);
    expect(result.score).toBeLessThan(75);
    expect(result.warnings.length).toBeGreaterThan(2);
  });

  it("returns null score when no camera provenance exists", () => {
    const result = assessCaptureRepeatability({ current: {}, baseline: {} });
    expect(result.score).toBeNull();
    expect(result.comparable).toBe(false);
  });
});
