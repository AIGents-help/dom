import { describe, expect, it } from "vitest";
import { decideInspectionQualityRecapture } from "@/lib/dominicInspectionRecapture";
import type { ImageQualityAssessment } from "@/lib/imageQuality";

function quality(overrides: Partial<ImageQualityAssessment> = {}): ImageQualityAssessment {
  return {
    width: 5280,
    height: 3956,
    megapixels: 20.8,
    sharpnessScore: 0.8,
    exposureScore: 0.8,
    contrastScore: 0.7,
    shadowClipPct: 1,
    highlightClipPct: 1,
    meanLuminance: 127,
    usable: true,
    warnings: [],
    ...overrides,
  };
}

describe("DOMINIC inspection quality recapture", () => {
  it("retries once for a soft image and requests refocus", () => {
    const decision = decideInspectionQualityRecapture({
      quality: quality({ sharpnessScore: 0.32, usable: false }),
      attempts: 0,
    });
    expect(decision.retry).toBe(true);
    expect(decision.refocus).toBe(true);
    expect(decision.unlockExposure).toBe(false);
  });

  it("retries once for clipped exposure and releases AE lock", () => {
    const decision = decideInspectionQualityRecapture({
      quality: quality({ exposureScore: 0.35, highlightClipPct: 28, usable: false }),
      attempts: 0,
    });
    expect(decision.retry).toBe(true);
    expect(decision.unlockExposure).toBe(true);
  });

  it("does not retry resolution-only failures", () => {
    const decision = decideInspectionQualityRecapture({
      quality: quality({ megapixels: 0.4, usable: false }),
      attempts: 0,
    });
    expect(decision.retry).toBe(false);
  });

  it("never exceeds the retry budget", () => {
    const decision = decideInspectionQualityRecapture({
      quality: quality({ sharpnessScore: 0.2, usable: false }),
      attempts: 1,
    });
    expect(decision.retry).toBe(false);
  });
});
