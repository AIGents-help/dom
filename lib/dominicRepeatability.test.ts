import { describe, expect, it } from "vitest";
import { evaluateRepeatabilityAlignment } from "@/lib/dominicRepeatability";

describe("DOMINIC repeatability alignment", () => {
  it("marks a closely matched repeat viewpoint ready", () => {
    const result = evaluateRepeatabilityAlignment({
      baseline: { relativeAltitudeFt: 100, headingDeg: 358, gimbalPitchDeg: -35 },
      current: { relativeAltitudeFt: 102, headingDeg: 2, gimbalPitchDeg: -37 },
    });
    expect(result.ready).toBe(true);
    expect(result.headingDeltaDeg).toBe(4);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("guides the pilot when viewpoint differs materially", () => {
    const result = evaluateRepeatabilityAlignment({
      baseline: { relativeAltitudeFt: 80, headingDeg: 90, gimbalPitchDeg: -45 },
      current: { relativeAltitudeFt: 95, headingDeg: 120, gimbalPitchDeg: -25 },
    });
    expect(result.ready).toBe(false);
    expect(result.guidance.join(" ")).toContain("Descend");
    expect(result.guidance.join(" ")).toContain("heading");
    expect(result.guidance.join(" ")).toContain("gimbal");
  });

  it("does not invent readiness without comparable telemetry", () => {
    const result = evaluateRepeatabilityAlignment({
      baseline: {},
      current: {},
    });
    expect(result.ready).toBe(false);
    expect(result.score).toBe(0);
  });
});
