import { describe, expect, it } from "vitest";
import { includedReportFindings, inspectionReportSummary, readAllReportRows, reportEvidenceIds } from "./dominicInspectionReport";
import type { InspectionFinding } from "./dominicInspectionEvidence";

function finding(id: string, severity: string, status = "needs_review", observed = "2026-01-01T00:00:00Z"): InspectionFinding {
  return { id, severity, review_status: status, observed_at: observed, title: id, description: null, confidence: null, sensor_mode: "rgb", detector: {}, spatial_anchor: {} };
}

describe("inspection report", () => {
  it("keeps older urgent findings first and separates candidates from confirmed issues", () => {
    const excluded = { ...finding("excluded", "critical", "confirmed"), detector: { reportIncluded: false } };
    const rows = [finding("low", "low", "confirmed"), finding("high-new", "high", "needs_review", "2026-02-01T00:00:00Z"), finding("critical", "critical"), finding("high-old", "high", "confirmed"), finding("dismissed", "critical", "dismissed"), excluded];
    expect(includedReportFindings(rows).map((row) => row.id)).toEqual(["critical", "high-old", "high-new", "low"]);
    expect(inspectionReportSummary(rows)).toEqual({ included: 4, confirmed: 2, candidates: 2, urgent: 3 });
    expect(rows[0].id).toBe("low");
  });

  it("fetches beyond 1000 rows even when responses are capped below the requested size", async () => {
    const rows = Array.from({ length: 1005 }, (_, index) => ({ id: String(index).padStart(6, "0") }));
    let calls = 0;
    const result = await readAllReportRows(async (after) => {
      calls++;
      return { data: rows.filter((row) => after === null || row.id > after).slice(0, 73), error: null };
    }, new AbortController().signal);
    expect(result).toEqual(rows);
    expect(calls).toBe(15);
  });

  it("rejects a failed later page rather than returning a partial report", async () => {
    await expect(readAllReportRows(async (after) => after === null ? { data: [{ id: "001" }], error: null } : { data: null, error: new Error("offline") }, new AbortController().signal)).rejects.toThrow("offline");
  });

  it("stops cancelled or non-advancing pagination", async () => {
    const controller = new AbortController();
    await expect(readAllReportRows(async () => { controller.abort(); return { data: [], error: null }; }, controller.signal)).rejects.toThrow("cancelled");
    await expect(readAllReportRows(async () => ({ data: [{ id: "001" }], error: null }), new AbortController().signal)).rejects.toThrow("did not advance");
  });

  it("requests only valid, deduplicated evidence references from included findings", () => {
    const source = "11111111-1111-4111-8111-111111111111", baseline = "22222222-2222-4222-8222-222222222222";
    const included = { ...finding("included", "high"), detector: { mediaId: source, baselineSourceMediaId: baseline } };
    const excluded = { ...finding("excluded", "critical"), detector: { mediaId: "33333333-3333-4333-8333-333333333333", reportIncluded: false } };
    expect(reportEvidenceIds([included, included, excluded, { ...finding("invalid", "low"), detector: { mediaId: "not-an-id" } }])).toEqual({ current: [source], baseline: [baseline] });
  });
});
