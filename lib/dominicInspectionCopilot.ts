type Evidence = {
  id: string; media_type: string; storage_path: string | null;
  sensor_mode: string; mime_type: string | null; original_filename: string | null;
  analysis_status: string;
};
type Candidate = {
  id: string; title: string; severity: string; review_status: string;
  detector: Record<string, unknown>; spatial_anchor: Record<string, unknown>;
};
export type InspectionCopilotAction = {
  id: string; kind: "review" | "screen" | "retry";
  title: string; reason: string; findingId?: string; mediaId?: string;
};

/** Prioritize persisted evidence; never infer coverage, safety or asset condition. */
export function inspectionCopilotActions(media: Evidence[], findings: Candidate[]) {
  const rank: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  const mediaIds = new Set(media.map((item) => item.id));
  const reviews: InspectionCopilotAction[] = findings
    .filter((finding) => ["detected", "needs_review"].includes(finding.review_status))
    .sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) || a.id.localeCompare(b.id))
    .map((finding) => {
      const sourceId = typeof finding.detector.mediaId === "string" ? finding.detector.mediaId
        : typeof finding.spatial_anchor.mediaId === "string" ? finding.spatial_anchor.mediaId : undefined;
      return {
        id: `review:${finding.id}`, kind: "review", findingId: finding.id,
        mediaId: sourceId && mediaIds.has(sourceId) ? sourceId : undefined,
        title: finding.title,
        reason: `${finding.severity.toUpperCase()} candidate · operator review required.${sourceId && mediaIds.has(sourceId) ? " Open the source image and report notes." : " No linked source image is available in this inspection; verify the evidence before confirming."}`,
      };
    });
  const screening: InspectionCopilotAction[] = media
    .filter((item) => item.media_type === "image" && item.storage_path &&
      ["rgb", "zoom"].includes(item.sensor_mode) &&
      ["image/jpeg", "image/png", "image/webp"].includes(item.mime_type ?? "") &&
      ["pending", "failed"].includes(item.analysis_status))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      id: `screen:${item.id}`, kind: item.analysis_status === "failed" ? "retry" : "screen",
      mediaId: item.id, title: item.original_filename ?? "Saved inspection image",
      reason: item.analysis_status === "failed" ? "Screening failed. Retry this saved image; no conclusion is available." : "Saved visual evidence has not been screened. Run screening to produce reviewable candidates.",
    }));
  return [...reviews, ...screening];
}
