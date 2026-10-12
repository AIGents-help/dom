/** Presentation helpers only: not aircraft, authorization or diagnosis decisions. */
/** @param {string} status */
export function photoReviewStatus(status) {
  if (status === 'confirmed') return { label: 'Confirmed finding', tone: 'green', canReview: false };
  if (status === 'dismissed') return { label: 'Dismissed', tone: 'neutral', canReview: false };
  if (status === 'needs_review' || status === 'detected') return { label: 'Needs your review', tone: 'amber', canReview: true };
  return { label: 'Review status unavailable', tone: 'neutral', canReview: false };
}
/** @param {Record<string, unknown> | null | undefined} detector */
export function photoReportDraft(detector) {
  return { note: typeof detector?.reportNote === 'string' ? detector.reportNote : '', included: detector?.reportIncluded !== false };
}
/** Reject mismatched or incomplete response data before rendering private evidence.
 * @param {unknown} value @param {string} inspectionId @param {string} findingId
 */
export function assertPhotoReviewReport(value, inspectionId, findingId) {
  const data = /** @type {{inspection?:{id?:unknown}, asset?:{id?:unknown,name?:unknown}, findings?:{id?:unknown,detector?:unknown,spatial_anchor?:unknown}[], media?:unknown[], baselineMedia?:unknown[]}|null} */ (value);
  const selected = Array.isArray(data?.findings) ? data.findings.find((row) => row?.id === findingId) : null;
  if (!data || data.inspection?.id !== inspectionId || typeof data.asset?.id !== 'string' || typeof data.asset.name !== 'string' ||
      !selected || !selected.detector || typeof selected.detector !== 'object' || Array.isArray(selected.detector) ||
      !selected.spatial_anchor || typeof selected.spatial_anchor !== 'object' || Array.isArray(selected.spatial_anchor) ||
      !Array.isArray(data.media) || !Array.isArray(data.baselineMedia)) {
    throw new Error('The evidence did not match this inspection and finding. Close this view and try again.');
  }
}
/** @param {string | null | undefined} value */
export function photoCaptureTime(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'Capture time not recorded';
}
