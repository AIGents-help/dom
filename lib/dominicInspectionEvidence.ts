export type InspectionFinding = {
  id: string; title: string; description: string | null; severity: string;
  review_status: string; confidence: number | null; sensor_mode: string | null;
  spatial_anchor: Record<string, unknown>; detector: Record<string, unknown>; observed_at: string;
};
export type InspectionMedia = {
  id: string; original_filename: string | null; captured_at: string | null;
  created_at: string; sensor_mode: string; url: string | null;
};
export type InspectionReportData = {
  inspection: { id: string; inspection_type: string; objective: string | null; status: string; summary: string | null };
  asset: { id: string; name: string; asset_type: string };
  findings: InspectionFinding[]; media: InspectionMedia[]; baselineMedia: InspectionMedia[];
  generatedAt: string;
};
export function findingMediaId(finding: InspectionFinding) {
  const value = finding.detector?.mediaId ?? finding.spatial_anchor?.mediaId;
  return typeof value === "string" ? value : null;
}
export function findingImageRegion(finding: Pick<InspectionFinding, "spatial_anchor">) {
  const raw = finding.spatial_anchor?.imageRegion;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const { x, y, width, height } = record;
  if (![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const left = x as number, top = y as number, w = width as number, h = height as number;
  if (left < 0 || top < 0 || left >= 1 || top >= 1 || w <= 0 || h <= 0) return null;
  return { x: left, y: top, width: Math.min(w, 1 - left), height: Math.min(h, 1 - top) };
}
