export type DominicComparisonState =
  | "new"
  | "unchanged"
  | "improving"
  | "worsening"
  | "uncertain";

export type DominicIssueProgressionEvent =
  | "observed_again"
  | "observed_unchanged"
  | "observed_improving"
  | "observed_worsening"
  | "observed_uncertain";

export function normalizeComparisonState(value: unknown): DominicComparisonState | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "new" ||
    normalized === "unchanged" ||
    normalized === "improving" ||
    normalized === "worsening" ||
    normalized === "uncertain"
  ) {
    return normalized;
  }
  return null;
}

export function progressionEventType(
  comparisonState: DominicComparisonState | null,
): DominicIssueProgressionEvent {
  switch (comparisonState) {
    case "worsening":
      return "observed_worsening";
    case "improving":
      return "observed_improving";
    case "unchanged":
      return "observed_unchanged";
    case "uncertain":
      return "observed_uncertain";
    default:
      return "observed_again";
  }
}

export function progressionSummary(input: {
  title: string;
  comparisonState: DominicComparisonState | null;
}) {
  switch (input.comparisonState) {
    case "worsening":
      return `Issue appears worse than prior confirmed evidence: ${input.title}`;
    case "improving":
      return `Issue appears improved versus prior confirmed evidence: ${input.title}`;
    case "unchanged":
      return `Issue appears visually unchanged versus prior confirmed evidence: ${input.title}`;
    case "uncertain":
      return `Issue comparison is uncertain versus prior evidence: ${input.title}`;
    default:
      return `Issue observed again during inspection: ${input.title}`;
  }
}

export function nextProgressionMetadata(
  previous: Record<string, unknown>,
  comparisonState: DominicComparisonState | null,
) {
  const next = { ...previous };

  const bump = (key: string) => {
    next[key] = typeof previous[key] === "number" ? Number(previous[key]) + 1 : 1;
  };

  switch (comparisonState) {
    case "worsening":
      bump("worseningCount");
      break;
    case "improving":
      bump("improvingCount");
      break;
    case "unchanged":
      bump("unchangedCount");
      break;
    case "uncertain":
      bump("uncertainComparisonCount");
      break;
    default:
      break;
  }

  return next;
}
