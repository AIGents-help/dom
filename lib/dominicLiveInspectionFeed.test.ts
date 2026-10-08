import { describe, expect, it } from "vitest";
import { liveInspectionFeed, type LiveInspectionFinding } from "./dominicLiveInspectionFeed";

const finding = (id: string, severity: LiveInspectionFinding["severity"] = "low"): LiveInspectionFinding => ({
  id, severity, finding_type: "visual_anomaly", title: id, description: null,
  review_status: "needs_review", confidence: .8, sensor_mode: "rgb", observed_at: "2026-10-08T08:00:00Z",
});
describe("persisted live inspection feed", () => {
  it("retains older urgent work ahead of recent lower-severity findings", () => {
    const result = liveInspectionFeed([
      { findings: [finding("old-critical", "critical")], count: 1 },
      { findings: [finding("old-high", "high")], count: 1 },
      { findings: Array.from({ length: 12 }, (_, i) => finding(`recent-${i}`)), count: 25 },
    ]);
    expect(result.findings).toHaveLength(12);
    expect(result.findings.slice(0, 2).map((item) => item.id)).toEqual(["old-critical", "old-high"]);
    expect(result.total).toBe(27);
  });
  it("does not recreate a reviewed candidate when an outdated row is returned", () => {
    expect(liveInspectionFeed([{ findings: [{ ...finding("reviewed"), review_status: "confirmed" }], count: 0 }]).findings).toEqual([]);
  });
  it("shows each candidate once when results overlap", () => {
    expect(liveInspectionFeed([{ findings: [finding("same"), finding("same")], count: 1 }]).findings).toHaveLength(1);
  });
});
