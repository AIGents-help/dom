import { describe, expect, it } from "vitest";
import {
  effectiveComparisonState,
  evaluateComparisonComparability,
} from "@/lib/dominicComparisonComparability";

describe("DOMINIC comparison comparability", () => {
  it("rates closely reproduced evidence highly", () => {
    const result = evaluateComparisonComparability({
      baseline: {
        relativeAltitudeFt: 100,
        headingDeg: 358,
        gimbalPitchDeg: -35,
        cameraSource: "zoom",
        zoomRatio: 3,
        focusTarget: { x: 0.5, y: 0.5 },
        aeLocked: true,
      },
      current: {
        relativeAltitudeFt: 102,
        headingDeg: 2,
        gimbalPitchDeg: -37,
        cameraSource: "zoom",
        zoomRatio: 3.1,
        focusTarget: { x: 0.54, y: 0.48 },
        aeLocked: true,
      },
    });
    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.focusTargetDistance).not.toBeNull();
    expect(result.aeLockMatch).toBe(true);
  });

  it("rates materially different evidence low and downgrades change claims", () => {
    const result = evaluateComparisonComparability({
      baseline: {
        relativeAltitudeFt: 80,
        headingDeg: 90,
        gimbalPitchDeg: -45,
        cameraSource: "wide",
        zoomRatio: 1,
        focusTarget: { x: 0.2, y: 0.2 },
        aeLocked: true,
      },
      current: {
        relativeAltitudeFt: 105,
        headingDeg: 135,
        gimbalPitchDeg: -15,
        cameraSource: "zoom",
        zoomRatio: 4,
        focusTarget: { x: 0.8, y: 0.8 },
        aeLocked: false,
      },
    });
    expect(result.level).toBe("low");
    expect(result.focusTargetDistance).toBeGreaterThan(0.12);
    expect(result.aeLockMatch).toBe(false);
    expect(effectiveComparisonState("worsening", result)).toBe("uncertain");
  });

  it("reports unknown when capture geometry is unavailable", () => {
    const result = evaluateComparisonComparability({
      baseline: {},
      current: {},
    });
    expect(result.level).toBe("unknown");
    expect(result.score).toBeNull();
  });
});
