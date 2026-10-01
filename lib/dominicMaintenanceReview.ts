export type DominicMaintenanceReviewPriority =
  | "attention_now"
  | "elevated"
  | "routine"
  | "monitor";

export type DominicMaintenanceReviewInput = {
  severity: string;
  status: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DominicMaintenanceReviewAssessment = {
  priority: DominicMaintenanceReviewPriority;
  score: number;
  reasons: string[];
  unresolvedDays: number | null;
};

const severityScore: Record<string, number> = {
  info: 1,
  low: 2,
  medium: 4,
  high: 7,
  critical: 10,
};

const priorityRank: Record<DominicMaintenanceReviewPriority, number> = {
  monitor: 0,
  routine: 1,
  elevated: 2,
  attention_now: 3,
};

function count(metadata: Record<string, unknown>, key: string) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function unresolvedDays(firstSeenAt: string | null | undefined, now: Date) {
  if (!firstSeenAt) return null;
  const first = new Date(firstSeenAt);
  if (Number.isNaN(first.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - first.getTime()) / 86_400_000));
}

export function deriveMaintenanceReviewPriority(
  input: DominicMaintenanceReviewInput,
  now = new Date(),
): DominicMaintenanceReviewAssessment {
  const metadata = input.metadata ?? {};
  const severity = input.severity.trim().toLowerCase();
  const status = input.status.trim().toLowerCase();
  const latestComparisonState =
    typeof metadata.latestComparisonState === "string"
      ? metadata.latestComparisonState.trim().toLowerCase()
      : null;
  const recurrenceCount = count(metadata, "recurrenceCount");
  const worseningCount = count(metadata, "worseningCount");
  const uncertainComparisonCount = count(metadata, "uncertainComparisonCount");
  const ageDays = unresolvedDays(input.firstSeenAt, now);
  const reasons: string[] = [];

  let score = severityScore[severity] ?? 1;

  if (severity === "critical") reasons.push("Critical triage severity requires immediate operator review.");
  else if (severity === "high") reasons.push("High triage severity raises maintenance review priority.");
  else if (severity === "medium") reasons.push("Medium triage severity warrants scheduled review.");

  if (latestComparisonState === "worsening") {
    score += 4;
    reasons.push("Latest confirmed comparison indicates visible worsening.");
  } else if (latestComparisonState === "unchanged") {
    score += 1;
    reasons.push("Issue remains visibly present on repeat evidence.");
  } else if (latestComparisonState === "uncertain") {
    score += 1;
    reasons.push("Latest comparison is uncertain and needs human review.");
  } else if (latestComparisonState === "improving") {
    score = Math.max(0, score - 1);
    reasons.push("Latest comparison indicates visible improvement.");
  }

  if (worseningCount >= 2) {
    score += 3;
    reasons.push(`Visible worsening has been confirmed across ${worseningCount} repeat comparisons.`);
  } else if (worseningCount === 1 && latestComparisonState !== "worsening") {
    score += 1;
    reasons.push("A prior repeat comparison recorded visible worsening.");
  }

  if (recurrenceCount >= 5) {
    score += 3;
    reasons.push(`Issue has recurred ${recurrenceCount} times.`);
  } else if (recurrenceCount >= 2) {
    score += 2;
    reasons.push(`Issue has recurred ${recurrenceCount} times.`);
  } else if (recurrenceCount === 1) {
    score += 1;
    reasons.push("Issue has been confirmed on a repeat inspection.");
  }

  if (uncertainComparisonCount >= 2) {
    score += 1;
    reasons.push("Multiple repeat comparisons remain uncertain.");
  }

  if (["open", "monitoring", "in_progress"].includes(status) && ageDays !== null) {
    if (ageDays >= 90) {
      score += 2;
      reasons.push(`Issue has remained unresolved for about ${ageDays} days.`);
    } else if (ageDays >= 30) {
      score += 1;
      reasons.push(`Issue has remained unresolved for about ${ageDays} days.`);
    }
  }

  if (status === "in_progress") {
    score += 1;
    reasons.push("Issue is already in active maintenance follow-up.");
  }

  let priority: DominicMaintenanceReviewPriority;
  if (severity === "critical" || score >= 10) priority = "attention_now";
  else if (score >= 7) priority = "elevated";
  else if (score >= 4) priority = "routine";
  else priority = "monitor";

  return {
    priority,
    score,
    reasons: reasons.slice(0, 6),
    unresolvedDays: ageDays,
  };
}

export function maintenanceReviewPriorityLabel(priority: DominicMaintenanceReviewPriority) {
  switch (priority) {
    case "attention_now":
      return "Attention now";
    case "elevated":
      return "Elevated";
    case "routine":
      return "Routine";
    case "monitor":
      return "Monitor";
  }
}

export function maintenanceReviewPriorityRank(priority: DominicMaintenanceReviewPriority) {
  return priorityRank[priority];
}
