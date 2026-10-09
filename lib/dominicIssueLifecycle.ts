export type DominicVerificationAssessmentStatus =
  | "not_started"
  | "capturing"
  | "needs_review"
  | "cleared"
  | "improved"
  | "failed"
  | "insufficient";

export type DominicVerificationAssessment = {
  status: DominicVerificationAssessmentStatus;
  canVerify: boolean;
  shouldReopen: boolean;
  reasons: string[];
};

export function issueLifecycleLabel(input: {
  status: string;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = input.metadata ?? {};
  const verificationStatus =
    typeof metadata.verificationStatus === "string"
      ? metadata.verificationStatus
      : null;

  if (input.status === "verified") return "Verified";
  if (input.status === "resolved" && verificationStatus === "in_progress") {
    return "Verification In Progress";
  }
  if (
    input.status === "resolved" &&
    (verificationStatus === "required" || metadata.verificationRequired === true)
  ) {
    return "Verification Required";
  }
  if (input.status === "in_progress") return "Maintenance In Progress";
  return input.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deriveVerificationAssessment(input: {
  inspectionStatus?: string | null;
  baselineCompared?: boolean | null;
  candidateCount?: number | null;
  comparabilityLevel?: string | null;
  pendingReviewCount?: number | null;
  confirmedCount?: number | null;
  dismissedCount?: number | null;
  comparisonStates?: Array<string | null | undefined>;
  screening?: { mediaTotal: number; unfinished: number; invalidComparison: number };
}): DominicVerificationAssessment {
  if (!input.inspectionStatus) {
    return {
      status: "not_started",
      canVerify: false,
      shouldReopen: false,
      reasons: ["No post-maintenance verification inspection has been created yet."],
    };
  }

  if (["planned", "capturing", "analyzing"].includes(input.inspectionStatus)) {
    return {
      status: "capturing",
      canVerify: false,
      shouldReopen: false,
      reasons: ["Post-maintenance verification capture or analysis is still in progress."],
    };
  }

  if (!["review", "complete"].includes(input.inspectionStatus)) {
    return { status: "insufficient", canVerify: false, shouldReopen: false, reasons: ["The verification inspection is not ready for review."] };
  }
  if (input.screening) {
    if (input.screening.mediaTotal === 0) {
      return { status: "insufficient", canVerify: false, shouldReopen: false, reasons: ["No saved post-maintenance evidence has been screened."] };
    }
    if (input.screening.unfinished > 0) {
      return { status: "capturing", canVerify: false, shouldReopen: false, reasons: [`${input.screening.unfinished} evidence item${input.screening.unfinished === 1 ? "" : "s"} still require successful screening.`] };
    }
    if (input.screening.invalidComparison > 0) {
      return { status: "insufficient", canVerify: false, shouldReopen: false, reasons: ["Every verification image needs a completed, comparable baseline result before closure."] };
    }
  }

  if (!input.baselineCompared) {
    return {
      status: "insufficient",
      canVerify: false,
      shouldReopen: false,
      reasons: ["The post-maintenance evidence has not been validly compared with the pre-maintenance baseline."],
    };
  }

  if (
    !input.comparabilityLevel ||
    input.comparabilityLevel === "low" ||
    input.comparabilityLevel === "unknown"
  ) {
    return {
      status: "insufficient",
      canVerify: false,
      shouldReopen: false,
      reasons: ["The post-maintenance capture is not comparable enough to the baseline for reliable closure. Recapture from the baseline viewpoint and camera geometry."],
    };
  }

  if (!Number.isSafeInteger(input.candidateCount) || Number(input.candidateCount) < 0) {
    return {
      status: "insufficient",
      canVerify: false,
      shouldReopen: false,
      reasons: ["The verification inspection does not yet contain a completed candidate-count result."],
    };
  }

  const pending = Number(input.pendingReviewCount ?? 0);
  if (pending > 0) {
    return {
      status: "needs_review",
      canVerify: false,
      shouldReopen: false,
      reasons: [`${pending} comparison finding${pending === 1 ? "" : "s"} still require human review.`],
    };
  }

  const candidates = Math.max(0, Number(input.candidateCount ?? 0));
  const states = (input.comparisonStates ?? [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  const confirmed = Number(input.confirmedCount ?? states.length);
  const dismissed = Number(input.dismissedCount ?? 0);
  if (states.some((state) => state === "worsening" || state === "unchanged")) {
    return {
      status: "failed", canVerify: false, shouldReopen: true,
      reasons: ["Confirmed post-maintenance evidence shows the issue is unchanged or worsening."],
    };
  }
  if (confirmed + dismissed < candidates) {
    return { status: "insufficient", canVerify: false, shouldReopen: false, reasons: ["The saved findings do not account for every screened candidate. Refresh or rescreen the evidence before closure."] };
  }
  if (candidates === 0 && confirmed === 0 && dismissed === 0) {
    return {
      status: "cleared",
      canVerify: true,
      shouldReopen: false,
      reasons: ["DOMINIC compared the post-maintenance evidence with the baseline and did not detect a remaining candidate anomaly."],
    };
  }

  if (confirmed === 0 && dismissed >= candidates) {
    return {
      status: "cleared",
      canVerify: true,
      shouldReopen: false,
      reasons: ["DOMINIC flagged comparison candidates, but human review dismissed all of them as non-issues."],
    };
  }

  if (confirmed > 0 && states.length > 0 && states.every((state) => state === "improving")) {
    return {
      status: "improved",
      canVerify: true,
      shouldReopen: false,
      reasons: ["Confirmed post-maintenance evidence shows improvement relative to the pre-maintenance baseline."],
    };
  }

  return {
    status: "needs_review",
    canVerify: false,
    shouldReopen: false,
    reasons: ["Post-maintenance candidates exist, but the comparison outcome is not yet sufficient for verification."],
  };
}
