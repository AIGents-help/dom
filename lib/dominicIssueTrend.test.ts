import { describe, expect, it } from "vitest";
import { deriveIssueTrend } from "@/lib/dominicIssueTrend";

describe("DOMINIC issue trend intelligence", () => {
  it("marks a single observation as new", () => {
    expect(
      deriveIssueTrend([
        { severity: "medium", confidence: 0.8, observedAt: "2026-09-01T00:00:00Z" },
      ]).trend,
    ).toBe("new");
  });

  it("detects worsening severity across repeat inspections", () => {
    const trend = deriveIssueTrend([
      { severity: "low", confidence: 0.7, observedAt: "2026-08-01T00:00:00Z" },
      { severity: "medium", confidence: 0.82, observedAt: "2026-09-01T00:00:00Z" },
      { severity: "high", confidence: 0.9, observedAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(trend.trend).toBe("worsening");
    expect(trend.highestSeverity).toBe("high");
    expect(trend.observationCount).toBe(3);
  });

  it("detects improving severity", () => {
    expect(
      deriveIssueTrend([
        { severity: "high", confidence: 0.91, observedAt: "2026-08-01T00:00:00Z" },
        { severity: "low", confidence: 0.74, observedAt: "2026-09-01T00:00:00Z" },
      ]).trend,
    ).toBe("improving");
  });

  it("marks repeated same-severity observations as persistent", () => {
    expect(
      deriveIssueTrend([
        { severity: "medium", confidence: 0.77, observedAt: "2026-08-01T00:00:00Z" },
        { severity: "medium", confidence: 0.83, observedAt: "2026-09-01T00:00:00Z" },
      ]).trend,
    ).toBe("persistent");
  });

  it("marks fluctuating severity with same first/latest state as variable", () => {
    expect(
      deriveIssueTrend([
        { severity: "medium", confidence: 0.7, observedAt: "2026-08-01T00:00:00Z" },
        { severity: "high", confidence: 0.85, observedAt: "2026-09-01T00:00:00Z" },
        { severity: "medium", confidence: 0.8, observedAt: "2026-10-01T00:00:00Z" },
      ]).trend,
    ).toBe("mixed");
  });
});
