/** Presentation only. Saved statuses are not aircraft readiness or defect diagnoses. */
const states = {
  planned: { label: 'Ready to set up', action: 'Set up capture', tone: 'neutral', group: 'active' },
  capturing: { label: 'Collecting evidence', action: 'Review incoming photos', tone: 'blue', group: 'active' },
  analyzing: { label: 'Processing evidence', action: 'Open evidence', tone: 'blue', group: 'active' },
  review: { label: 'Needs your review', action: 'Review findings', tone: 'orange', group: 'review' },
  complete: { label: 'Report available', action: 'Open report', tone: 'green', group: 'complete' },
  cancelled: { label: 'Cancelled', action: 'View inspection', tone: 'neutral', group: 'closed' },
};
/** @param {string} status */
export function inspectionDisplayStatus(status) {
  return Object.hasOwn(states, status) ? states[/** @type {keyof typeof states} */ (status)] : {
    label: 'Status unavailable', action: 'View inspection', tone: 'neutral', group: 'unknown',
  };
}
/** @param {string} value */
export function readableInspectionType(value) {
  const labels = { visual: 'Visual inspection', thermal: 'Thermal inspection', ldar: 'Gas inspection', mapping: 'Mapping survey', roof: 'Roof inspection' };
  return Object.hasOwn(labels, value) ? labels[/** @type {keyof typeof labels} */ (value)] : value.replaceAll('_', ' ');
}
/** @template {{id: string, asset_name: string, inspection_type: string, objective: string|null, status: string}} T
 * @param {T[]} rows @param {string} query @param {string} filter
 */
export function visibleProjectInspections(rows, query, filter) {
  const term = query.trim().toLowerCase();
  return rows.filter((row) => (filter === 'all' || inspectionDisplayStatus(row.status).group === filter) &&
    (!term || [row.asset_name, row.inspection_type, row.objective ?? '', row.id].some((value) => value.toLowerCase().includes(term))));
}
