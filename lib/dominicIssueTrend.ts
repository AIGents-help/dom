export type DominicIssueObservation = {
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number | null;
  observedAt: string;
};

export type DominicIssueTrend =
  | "new"
  | "persistent"
  | "worsening"
  | "improving"
  | "mixed";

const severityRank: Record<DominicIssueObservation["severity"], number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function deriveIssueTrend(
  observations: DominicIssueObservation[],
): {
  trend: DominicIssueTrend;
  observationCount: number;
  firstSeverity: DominicIssueObservation["severity"] | null;
  latestSeverity: DominicIssueObservation["severity"] | null;
  highestSeverity: DominicIssueObservation["severity"] | null;
  firstObservedAt: string | null;
  latestObservedAt: string | null;
  latestConfidence: number | null;
} {
  if (!observations.length) {
    return {
      trend: "new",
      observationCount: 0,
      firstSeverity: null,
      latestSeverity: null,
      highestSeverity: null,
      firstObservedAt: null,
      latestObservedAt: null,
      latestConfidence: null,
    };
  }

  const ordered = [...observations].sort(
    (a, b) =>
      new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  const highest = ordered.reduce((current, observation) =>
    severityRank[observation.severity] > severityRank[current.severity]
      ? observation
      : current,
  );

  let trend: DominicIssueTrend = "new";
  if (ordered.length > 1) {
    const firstRank = severityRank[first.severity];
    const latestRank = severityRank[latest.severity];
    if (latestRank > firstRank) trend = "worsening";
    else if (latestRank < firstRank) trend = "improving";
    else {
      const ranks = new Set(ordered.map((item) => severityRank[item.severity]));
      trend = ranks.size > 1 ? "mixed" : "persistent";
    }
  }

  return {
    trend,
    observationCount: ordered.length,
    firstSeverity: first.severity,
    latestSeverity: latest.severity,
    highestSeverity: highest.severity,
    firstObservedAt: first.observedAt,
    latestObservedAt: latest.observedAt,
    latestConfidence: latest.confidence,
  };
}

export function issueTrendLabel(trend: DominicIssueTrend) {
  switch (trend) {
    case "new":
      return "New";
    case "persistent":
      return "Persistent";
    case "worsening":
      return "Worsening";
    case "improving":
      return "Improving";
    case "mixed":
      return "Variable";
  }
}
