import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deriveVerificationAssessment } from "@/lib/dominicIssueLifecycle";

export type DominicVerificationCounts = {
  total: number; pending: number; confirmed: number; dismissed: number;
  comparisonStates: string[]; mediaTotal: number; unfinished: number;
  invalidComparison: number; screenedCandidates: number;
};

// All counts and the inspection revision are read in one owned database snapshot.
// ai_summary and the finding sample describe only part of an inspection.
export async function loadDominicIssueVerification(
  admin: ReturnType<typeof getSupabaseAdmin>, userId: string, issueId: string,
  signal?: AbortSignal,
) {
  let query = admin.rpc("read_dominic_issue_verification", {
    p_issue_id: issueId, p_user_id: userId,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (!data) return null;
  const issue = data.issue as {
    id: string; asset_id: string; title: string; severity: string; status: string;
    recommended_action: string | null; resolution_notes: string | null;
    resolved_at: string | null; verified_at: string | null;
    metadata: Record<string, unknown>; updated_at: string;
  };
  const inspection = data.verificationInspection;
  const counts = data.verificationCounts as DominicVerificationCounts;
  const assessment = deriveVerificationAssessment({
    inspectionStatus: inspection?.status ?? null,
    baselineCompared: counts.mediaTotal > 0 && counts.invalidComparison === 0,
    candidateCount: Math.max(counts.screenedCandidates, counts.total),
    comparabilityLevel: counts.invalidComparison === 0 ? "medium" : "unknown",
    pendingReviewCount: counts.pending, confirmedCount: counts.confirmed,
    dismissedCount: counts.dismissed, comparisonStates: counts.comparisonStates,
    screening: counts,
  });
  return {
    issue: { ...issue, metadata: issue.metadata && typeof issue.metadata === "object" ? issue.metadata : {} },
    verificationInspection: inspection,
    verificationFindings: data.verificationFindings,
    verificationCounts: counts,
    assessment,
  };
}
