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
        pendingReviewCount: 0,
        comparisonStates: ["improving"],
      }),
    ).toMatchObject({ status: "improved", canVerify: true });
  });

  it("treats fully dismissed verification candidates as cleared", () => {
    expect(
      deriveVerificationAssessment({
        inspectionStatus: "review",
        baselineCompared: true,
        candidateCount: 2,
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
        pendingReviewCount: 1,
        comparisonStates: ["improving"],
      }),
    ).toMatchObject({ status: "needs_review", canVerify: false });
  });
});
