import {
  deriveMaintenanceReviewPriority,
  maintenanceReviewPriorityRank,
  type DominicMaintenanceReviewAssessment,
} from "@/lib/dominicMaintenanceReview";

export type MaintenanceQueueStage = "review" | "maintenance" | "verification";
export type MaintenanceQueueIssue = {
  id: string;
  asset_id: string;
  title: string;
  issue_type: string;
  severity: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
};
export type MaintenanceQueueAsset = {
  id: string;
  name: string;
  external_ref: string | null;
  location_label: string | null;
};
export type MaintenanceQueueEntry = {
  issue: MaintenanceQueueIssue;
  asset: MaintenanceQueueAsset | null;
  stage: MaintenanceQueueStage;
  assessment: DominicMaintenanceReviewAssessment;
  workOrder: string | null;
};

export function maintenanceQueueStage(issue: Pick<MaintenanceQueueIssue, "status" | "metadata">): MaintenanceQueueStage | null {
  if (issue.status === "open" || issue.status === "monitoring") return "review";
  if (issue.status === "in_progress") return "maintenance";
  const metadata = issue.metadata ?? {};
  if (issue.status === "resolved" && (
    metadata.verificationRequired === true ||
    metadata.verificationStatus === "required" ||
    metadata.verificationStatus === "in_progress"
  )) return "verification";
  return null;
}

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function buildMaintenanceQueue(
  issues: MaintenanceQueueIssue[],
  assets: MaintenanceQueueAsset[],
  assessments?: ReadonlyMap<string, DominicMaintenanceReviewAssessment>,
): MaintenanceQueueEntry[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const entries: MaintenanceQueueEntry[] = [];
  for (const issue of issues) {
    const stage = maintenanceQueueStage(issue);
    if (!stage) continue;
    entries.push({
      issue,
      stage,
      asset: assetById.get(issue.asset_id) ?? null,
      assessment: assessments?.get(issue.id) ?? deriveMaintenanceReviewPriority({
        severity: issue.severity,
        status: issue.status,
        firstSeenAt: issue.first_seen_at,
        lastSeenAt: issue.last_seen_at,
        metadata: issue.metadata,
      }),
      workOrder: typeof issue.metadata?.maintenanceWorkOrder === "string"
        ? issue.metadata.maintenanceWorkOrder : null,
    });
  }
  return entries.sort((a, b) =>
    maintenanceReviewPriorityRank(b.assessment.priority) - maintenanceReviewPriorityRank(a.assessment.priority) ||
    b.assessment.score - a.assessment.score ||
    timestamp(a.issue.first_seen_at) - timestamp(b.issue.first_seen_at) ||
    a.issue.id.localeCompare(b.issue.id),
  );
}

export function filterMaintenanceQueue(entries: MaintenanceQueueEntry[], input: {
  stage?: MaintenanceQueueStage | "all";
  priority?: "all" | "escalated";
  search?: string;
}) {
  const query = input.search?.trim().toLowerCase() ?? "";
  return entries.filter((entry) => {
    if (input.stage && input.stage !== "all" && entry.stage !== input.stage) return false;
    if (input.priority === "escalated" && !["attention_now", "elevated"].includes(entry.assessment.priority)) return false;
    return !query || [entry.issue.title, entry.issue.issue_type, entry.asset?.name,
      entry.asset?.external_ref, entry.asset?.location_label, entry.workOrder]
      .some((value) => value?.toLowerCase().includes(query));
  });
}

// Stable id ordering is required at the caller. Never return a partial queue
// after a failed page: older urgent issues must not silently disappear.
export async function loadAllMaintenanceRows<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 200,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid maintenance page size");
  const rows = new Map<string, T>();
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Maintenance records did not return a valid page");
    const previousSize = rows.size;
    for (const row of result.data) rows.set(row.id, row);
    if (result.data.length < pageSize) return [...rows.values()];
    if (rows.size === previousSize) throw new Error("Maintenance pagination did not advance. Refresh to retry.");
  }
}
