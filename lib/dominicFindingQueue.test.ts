import { expect, it } from "vitest";
import { findingReviewQueue, reviewPage } from "./dominicFindingQueue";
import type { InspectionFinding } from "./dominicInspectionEvidence";
const row = (id: string, severity: string, review_status = "needs_review", observed_at = "2026-01-01T00:00:00Z"): InspectionFinding => ({ id, title: id, severity, review_status, observed_at, description: null, confidence: null, sensor_mode: "rgb", detector: {}, spatial_anchor: {} });
it("puts pending urgent work ahead of recent low findings and reviewed findings", () => {
  const findings = [row("reviewed-critical", "critical", "confirmed"), row("low", "low"), row("high-new", "high", "needs_review", "2026-02-01T00:00:00Z"), row("critical", "critical"), row("high-old", "high")];
  expect(findingReviewQueue(findings, "all", "").map((finding) => finding.id)).toEqual(["critical", "high-old", "high-new", "low", "reviewed-critical"]);
  expect(findings[0].id).toBe("reviewed-critical");
});
it("searches beyond the first page and filters reviewed statuses", () => {
  const findings = Array.from({ length: 1005 }, (_, i) => row(`candidate ${i}`, "low", i === 1004 ? "dismissed" : "needs_review"));
  expect(findingReviewQueue(findings, "dismissed", "  CANDIDATE 1004 ")).toHaveLength(1);
  expect(findingReviewQueue(findings, "pending", "1004")).toEqual([]);
});
it("reaches the last evidence page and clamps after deletion or filtering", () => {
  const rows = Array.from({ length: 1005 }, (_, i) => i);
  const last = reviewPage(rows, 999);
  expect(last.page).toBe(83); expect(last.start).toBe(996); expect(last.rows).toEqual(rows.slice(996));
  expect(reviewPage([1, 2], 83)).toMatchObject({ page: 0, start: 0, rows: [1, 2] });
  expect(reviewPage([], 83)).toMatchObject({ page: 0, last: 0, rows: [] });
});
