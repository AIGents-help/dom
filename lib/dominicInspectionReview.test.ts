import { describe, expect, it } from "vitest";
import { parseInspectionReviewQuery } from "./dominicInspectionReview";

describe("inspection review requests", () => {
  it("defaults to the first unfiltered pages", () => {
    expect(parseInspectionReviewQuery(new URLSearchParams())).toEqual({ mediaPage: 0, findingPage: 0, filter: "all", search: "" });
  });
  it("keeps search text literal and supports pages beyond the row limit", () => {
    expect(parseInspectionReviewQuery(new URLSearchParams({ mediaPage: "83", findingPage: "83", filter: "pending", search: "  %_ seam, (critical)  " })))
      .toEqual({ mediaPage: 83, findingPage: 83, filter: "pending", search: "%_ seam, (critical)" });
  });
  it("rejects invalid paging, filters, and oversized searches", () => {
    const invalid: Record<string, string>[] = [{ mediaPage: "-1" }, { findingPage: "1.5" }, { findingPage: "1000000000" }, { filter: "deleted" }, { search: "x".repeat(201) }];
    for (const params of invalid) {
      expect(parseInspectionReviewQuery(new URLSearchParams(params))).toBeNull();
    }
  });
});
