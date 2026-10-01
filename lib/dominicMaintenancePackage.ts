export type MaintenancePackageMediaLike = {
  id: string;
  inspection_id: string;
  storage_path: string | null;
  captured_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type MaintenancePackageFindingLike = {
  inspection_id: string;
  spatial_anchor: Record<string, unknown> | null;
  detector: Record<string, unknown> | null;
};

export type MaintenancePackageFindingEvidenceLike = {
  source_id: string | null;
  storage_path: string | null;
};

export function maintenanceEvidenceRole(metadata: Record<string, unknown> | null | undefined) {
  const role = metadata?.evidenceRole;
  return role === "context" || role === "detail" || role === "quality_retry"
    ? role
    : "evidence";
}

export function maintenanceEvidenceSequenceId(
  metadata: Record<string, unknown> | null | undefined,
) {
  const value = metadata?.evidenceSequenceId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function findingPrimaryMediaId(
  finding: MaintenancePackageFindingLike,
) {
  const detectorMediaId = finding.detector?.mediaId;
  if (typeof detectorMediaId === "string" && detectorMediaId) return detectorMediaId;
  const anchorMediaId = finding.spatial_anchor?.mediaId;
  return typeof anchorMediaId === "string" && anchorMediaId ? anchorMediaId : null;
}

export function selectMaintenancePackageMedia(
  finding: MaintenancePackageFindingLike,
  media: MaintenancePackageMediaLike[],
  explicitEvidence: MaintenancePackageFindingEvidenceLike[] = [],
) {
  const inspectionMedia = media.filter(
    (item) => item.inspection_id === finding.inspection_id,
  );
  const primaryMediaId = findingPrimaryMediaId(finding);
  const primaryMedia = primaryMediaId
    ? inspectionMedia.find((item) => item.id === primaryMediaId) ?? null
    : null;
  const sequenceId = maintenanceEvidenceSequenceId(primaryMedia?.metadata);

  const selected = inspectionMedia.filter((item) => {
    if (item.id === primaryMediaId) return true;
    if (
      sequenceId &&
      maintenanceEvidenceSequenceId(item.metadata) === sequenceId
    ) {
      return true;
    }
    return explicitEvidence.some(
      (evidence) =>
        evidence.source_id === item.id ||
        (Boolean(evidence.storage_path) &&
          evidence.storage_path === item.storage_path),
    );
  });

  return selected.sort((a, b) => {
    const aTime = a.captured_at ? new Date(a.captured_at).getTime() : 0;
    const bTime = b.captured_at ? new Date(b.captured_at).getTime() : 0;
    return aTime - bTime;
  });
}
