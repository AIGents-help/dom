import type { InspectionFinding } from "./dominicInspectionEvidence";

export const EVIDENCE_REVIEW_PAGE_SIZE = 12;
export type FindingReviewFilter = "all" | "pending" | "confirmed" | "dismissed";
const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
export function findingReviewQueue<T extends InspectionFinding>(findings: T[], filter: FindingReviewFilter, search: string) {
  const query = search.trim().toLowerCase();
  const pending = (finding: T) => finding.review_status === "needs_review" || finding.review_status === "detected";
  return findings.filter((finding) => (filter === "all" || (filter === "pending" ? pending(finding) : finding.review_status === filter))
    && (!query || `${finding.title} ${finding.description ?? ""}`.toLowerCase().includes(query)))
    .sort((a, b) => Number(pending(b)) - Number(pending(a)) || (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5)
      || a.observed_at.localeCompare(b.observed_at) || a.id.localeCompare(b.id));
}

export function reviewPage<T>(rows: T[], requested: number) {
  const last = Math.max(0, Math.ceil(rows.length / EVIDENCE_REVIEW_PAGE_SIZE) - 1);
  const page = Math.min(Math.max(0, requested), last);
  const start = page * EVIDENCE_REVIEW_PAGE_SIZE;
  return { page, last, start, rows: rows.slice(start, start + EVIDENCE_REVIEW_PAGE_SIZE) };
}
