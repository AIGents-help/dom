import { describe, expect, it } from "vitest";
import { buildFollowUpCapturePrescription } from "@/lib/dominicFollowUpCapture";

describe("DOMINIC follow-up capture prescription", () => {
  it("asks for tighter optical framing on a small low-confidence candidate", () => {
    const result = buildFollowUpCapturePrescription({
      region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
      confidence: 0.62,
      targetLocation: { latitude: 39.95, longitude: -75.16, distanceM: 34 },
    });
    expect(result.needed).toBe(true);
    expect(result.targeting).toBe("laser_target");
    expect(result.estimatedOpticalZoomMultiplier).toBeGreaterThan(1);
    expect(result.guidance.join(" ")).toContain("optical zoom");
  });

  it("keeps a well-localized high-confidence frame as the baseline", () => {
    const result = buildFollowUpCapturePrescription({
      region: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
      confidence: 0.94,
      comparisonState: "unchanged",
    });
    expect(result.needed).toBe(false);
    expect(result.targeting).toBe("image_region");
  });

  it("requests follow-up when repeat inspection comparison is uncertain", () => {
    const result = buildFollowUpCapturePrescription({
      region: { x: 0.25, y: 0.25, width: 0.35, height: 0.3 },
      confidence: 0.9,
      comparisonState: "uncertain",
    });
    expect(result.needed).toBe(true);
    expect(result.reason.join(" ")).toContain("prior evidence");
  });
});
