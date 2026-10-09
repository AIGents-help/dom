import { describe, expect, it } from "vitest";
import {
  deriveVerificationAssessment,
  issueLifecycleLabel,
} from "@/lib/dominicIssueLifecycle";

describe("DOMINIC issue maintenance lifecycle", () => {
  it("labels resolved issues that still require verification", () => {
    expect(
      issueLifecycleLabel({
        status: "resolved",
        metadata: { verificationRequired: true, verificationStatus: "required" },
      }),
    ).toBe("Verification Required");
  });

  it("treats a valid baseline comparison with zero candidates as cleared", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 0,
        comparabilityLevel: "high",
        pendingReviewCount: 0,
      }),
    ).toMatchObject({ status: "cleared", canVerify: true, shouldReopen: false });
  });

  it("allows an improving confirmed comparison to verify", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 1,
        comparabilityLevel: "high",
        pendingReviewCount: 0,
        comparisonStates: ["improving"],
      }),
    ).toMatchObject({ status: "improved", canVerify: true });
  });

  it("blocks closure when capture geometry is a poor baseline match", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 0,
        comparabilityLevel: "low",
        pendingReviewCount: 0,
      }),
    ).toMatchObject({ status: "insufficient", canVerify: false });
  });

  it("treats fully dismissed verification candidates as cleared", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 2,
        comparabilityLevel: "high",
        pendingReviewCount: 0,
        confirmedCount: 0,
        dismissedCount: 2,
      }),
    ).toMatchObject({ status: "cleared", canVerify: true });
  });

  it("reopens when confirmed evidence is unchanged or worsening", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 1,
        comparabilityLevel: "high",
        pendingReviewCount: 0,
        comparisonStates: ["unchanged"],
      }),
    ).toMatchObject({ status: "failed", canVerify: false, shouldReopen: true });
  });

  it("blocks verification while findings still need review", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 2,
        comparabilityLevel: "high",
        pendingReviewCount: 1,
        comparisonStates: ["improving"],
      }),
    ).toMatchObject({ status: "needs_review", canVerify: false });
  });

  const ready = { inspectionStatus: "review", baselineCompared: true, candidateCount: 0,
    comparabilityLevel: "high", pendingReviewCount: 0 };

  it.each(["cancelled", "failed"])("blocks an inspection in %s state", (inspectionStatus) => {
    expect(deriveVerificationAssessment({ ...ready, inspectionStatus })).toMatchObject({ canVerify: false, status: "insufficient" });
  });

  it.each([NaN, -1, 0.5, Infinity, null])("rejects invalid candidate total %s", (candidateCount) => {
    expect(deriveVerificationAssessment({ ...ready, candidateCount })).toMatchObject({ canVerify: false, status: "insufficient" });
  });

  it("does not clear adverse confirmed evidence when the latest image reports zero candidates", () => {
    expect(deriveVerificationAssessment({ ...ready, confirmedCount: 1, comparisonStates: ["worsening"] }))
      .toMatchObject({ canVerify: false, status: "failed", shouldReopen: true });
  });

  it("blocks an incomplete saved candidate set", () => {
    expect(deriveVerificationAssessment({ ...ready, candidateCount: 2, confirmedCount: 1, comparisonStates: ["improving"] }))
      .toMatchObject({ canVerify: false, status: "insufficient" });
  });

  it("blocks a mixed confirmed comparison with an unknown outcome", () => {
    expect(deriveVerificationAssessment({ ...ready, candidateCount: 2, confirmedCount: 2, comparisonStates: ["improving", "unknown"] }))
      .toMatchObject({ canVerify: false, status: "needs_review" });
  });

  it.each([
    [{ mediaTotal: 0, unfinished: 0, invalidComparison: 0 }, "insufficient"],
    [{ mediaTotal: 2, unfinished: 1, invalidComparison: 0 }, "capturing"],
    [{ mediaTotal: 2, unfinished: 0, invalidComparison: 1 }, "insufficient"],
  ] as const)("blocks incomplete evidence screening %o", (screening, status) => {
    expect(deriveVerificationAssessment({ ...ready, screening })).toMatchObject({ canVerify: false, status });
  });
});
