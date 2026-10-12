/** Project-library presentation only. A completed map is not a completed inspection. */
export const PROJECT_HOME_PAGE_SIZE = 9;
const statuses = {
  draft: { label: 'Not started', group: 'preparing', tone: 'neutral' },
  uploading: { label: 'Uploading photos', group: 'preparing', tone: 'blue' },
  uploaded: { label: 'Photos uploaded', group: 'preparing', tone: 'neutral' },
  queued: { label: 'Waiting to process', group: 'processing', tone: 'blue' },
  processing: { label: 'Processing map', group: 'processing', tone: 'blue' },
  completed: { label: 'Map processing complete', group: 'completed', tone: 'green' },
  failed: { label: 'Map processing interrupted', group: 'attention', tone: 'orange' },
  cancelled: { label: 'Map processing cancelled', group: 'cancelled', tone: 'neutral' },
};
/** @param {string} status */
export function projectHomeStatus(status) {
  return Object.hasOwn(statuses, status) ? statuses[/** @type {keyof typeof statuses} */ (status)]
    : { label: 'Map status unavailable', group: 'unknown', tone: 'neutral' };
}
/** @param {string | null | undefined} date */
export function projectHomeDate(date) {
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not recorded';
}
/** @param {unknown} count */
export function projectPhotoCount(count) {
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? `${count.toLocaleString()} mapping ${count === 1 ? 'photo' : 'photos'}` : 'Photo count unavailable';
}
/** @template {{id:string,name:string,status:string,location_snapshot?:string|null,job?:{title?:string|null,location?:string|null}|null}} T
 * @param {T[]} projects @param {string} search @param {string} filter @param {number} page
 */
export function projectHomePage(projects, search, filter, page) {
  const query = search.trim().toLowerCase();
  const matches = projects.filter((project) => (filter === 'all' || projectHomeStatus(project.status).group === filter) &&
    (!query || [project.name, project.location_snapshot, project.job?.title, project.job?.location]
      .some((value) => typeof value === 'string' && value.toLowerCase().includes(query))));
  const pages = Math.max(1, Math.ceil(matches.length / PROJECT_HOME_PAGE_SIZE));
  const index = Number.isFinite(page) ? Math.min(Math.max(0, Math.floor(page)), pages - 1) : 0;
  return { rows: matches.slice(index * PROJECT_HOME_PAGE_SIZE, (index + 1) * PROJECT_HOME_PAGE_SIZE), page: index, pages, matching: matches.length };
}
/** Validate the existing API response instead of silently showing failed reads as an empty library.
 * @param {unknown} value
 */
export function assertProjectHomeResponse(value) {
  const body = /** @type {{projects?: {id?:unknown,name?:unknown,status?:unknown}[]}|null} */ (value);
  if (!body || !Array.isArray(body.projects)) throw new Error('The project list was incomplete. Please try again.');
  const ids = new Set();
  for (const project of body.projects) {
    if (!project || typeof project.id !== 'string' || !project.id.trim() || ids.has(project.id) ||
        typeof project.name !== 'string' || typeof project.status !== 'string') {
      throw new Error('The project list contained an invalid record. Please try again.');
    }
    ids.add(project.id);
  }
}
/** @param {string} accessToken @param {AbortSignal} signal @param {typeof fetch} [request] */
export async function readProjectHome(accessToken, signal, request = fetch) {
  if (!accessToken) throw new Error('Sign in again to open your projects.');
  const response = await request('/api/pilot/mapping/projects', {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Your projects could not be loaded. Please try again.');
  assertProjectHomeResponse(body);
  return body.projects;
}
