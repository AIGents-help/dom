export const LIVE_INSPECTION_FINDING_LIMIT = 12;

export type LiveInspectionFinding = {
  id: string;
  finding_type: string;
  title: string;
  description: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode: string | null;
  observed_at: string;
};

export type LiveInspectionFindingGroup = {
  findings: LiveInspectionFinding[];
  count: number;
};

// Disjoint query groups are ordered: oldest critical, oldest high, then recent
// remaining findings. Counts include rows beyond each group's display limit.
export function liveInspectionFeed(groups: LiveInspectionFindingGroup[]) {
  const byId = new Map<string, LiveInspectionFinding>();
  for (const group of groups) {
    for (const finding of group.findings) {
      if (finding.review_status === "needs_review" && !byId.has(finding.id)) byId.set(finding.id, finding);
    }
  }
  return {
    findings: Array.from(byId.values()).slice(0, LIVE_INSPECTION_FINDING_LIMIT),
    total: groups.reduce((sum, group) => sum + group.count, 0),
  };
}
