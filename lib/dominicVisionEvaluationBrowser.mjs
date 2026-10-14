import { evaluateDominicVision } from "./dominicVisionEvaluation.mjs";

export const MAX_BROWSER_EVALUATION_BYTES = 16 * 1024 * 1024;
export const EVALUATION_PAGE_SIZE = 12;

/** @param {string} confidence @param {string} overlap */
export function parseEvaluationThresholds(confidence, overlap) {
  const values = [confidence, overlap];
  if (values.some((value) => !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)) || Number(overlap) === 0) {
    throw new Error("Confidence must be 0 to 1; overlap (IoU) must be above 0 and at most 1. Enter decimal numbers.");
  }
  return { confidenceThreshold: Number(confidence), iouThreshold: Number(overlap) };
}

/** Runs in a dedicated worker. Hash, parse, score and serialize stay off the UI thread.
 * @param {Blob} file
 * @param {{confidenceThreshold?: number, iouThreshold?: number}} options
 */
export async function prepareBrowserVisionEvaluation(file, options) {
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_BROWSER_EVALUATION_BYTES) {
    throw new Error("Choose a nonempty dataset JSON file no larger than 16 MiB.");
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BROWSER_EVALUATION_BYTES) throw new Error("Dataset exceeds the 16 MiB limit.");
  let input;
  try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Dataset is not valid UTF-8 JSON."); }
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser hashing is unavailable. Open the HTTPS site in a supported browser.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const input_sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const report = { ...evaluateDominicVision(input, options), input_sha256 };
  return { report, reportJson: JSON.stringify(report, null, 2) + "\n" };
}

/** @typedef {Awaited<ReturnType<typeof prepareBrowserVisionEvaluation>>['report']} BrowserVisionReport */
/** @param {BrowserVisionReport} report @param {string} query @param {boolean} errorsOnly @param {number} page */
export function evaluationSamplePage(report, query, errorsOnly, page) {
  const search = query.trim().toLowerCase();
  const rows = report.samples.filter((sample) =>
    (!errorsOnly || sample.false_positives.length > 0 || sample.missed_ground_truth_ids.length > 0) &&
    (!search || sample.id.toLowerCase().includes(search) || sample.capture_group.toLowerCase().includes(search)));
  const pageCount = Math.max(1, Math.ceil(rows.length / EVALUATION_PAGE_SIZE));
  const current = Math.max(0, Math.min(Number.isFinite(page) ? Math.trunc(page) : 0, pageCount - 1));
  return { rows: rows.slice(current * EVALUATION_PAGE_SIZE, (current + 1) * EVALUATION_PAGE_SIZE), total: rows.length, page: current, pageCount };
}
