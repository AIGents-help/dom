import type { ScreeningJob } from "./dominicScreeningRecovery";
import type { FindingReviewFilter } from "./dominicFindingQueue";

export type MediaRow = {
  id: string;
  sensor_mode: string;
  media_type: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  captured_at: string | null;
  analysis_status: "pending" | "analyzing" | "review" | "complete" | "failed";
  analysis_summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FindingRow = {
  id: string;
  finding_type: string;
  title: string;
  description: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode: string | null;
  spatial_anchor: Record<string, unknown>;
  detector: Record<string, unknown>;
  observed_at: string;
};

export type InspectionReviewPage = {
  media: MediaRow[]; copilotMedia: MediaRow[]; findings: FindingRow[]; copilotFindings: FindingRow[];
  linkedFindings: { media_id: string; total: number; findings: FindingRow[] }[];
  jobs: ScreeningJob[]; hasProcessingJobs: boolean;
  mediaTotal: number; findingTotal: number; matchingTotal: number;
  needsReview: number; confirmedTotal: number; mediaPage: number; findingPage: number;
};
export type InspectionReviewQuery = { mediaPage: number; findingPage: number; filter: FindingReviewFilter; search: string };
export function parseInspectionReviewQuery(params: URLSearchParams): InspectionReviewQuery | null {
  const page = (key: string) => { const value = params.get(key) ?? "0"; return /^\d{1,9}$/.test(value) ? Number(value) : NaN; };
  const mediaPage = page("mediaPage"), findingPage = page("findingPage");
  const filter = params.get("filter") ?? "all", search = (params.get("search") ?? "").trim();
  if (!Number.isSafeInteger(mediaPage) || !Number.isSafeInteger(findingPage) || !["all", "pending", "confirmed", "dismissed"].includes(filter) || search.length > 200) return null;
  return { mediaPage, findingPage, filter: filter as FindingReviewFilter, search };
}
