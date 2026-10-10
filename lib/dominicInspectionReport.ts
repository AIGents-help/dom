import { findingMediaId, type InspectionFinding } from "./dominicInspectionEvidence";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
export const REPORT_PAGE_SIZE = 500;

// Continue until an empty page, even when the server caps responses below our
// requested page size. A unique ID cursor avoids offset shifts and tied dates.
export async function readAllReportRows<T extends { id: string }>(
  page: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  while (!signal.aborted) {
    const result = await page(after);
    if (signal.aborted) throw new Error("Report request timed out or was cancelled.");
    if (result.error) throw result.error;
    const next = result.data ?? [];
    if (!next.length) return rows;
    const cursor = next[next.length - 1].id;
    if (after !== null && cursor <= after) throw new Error("Report pagination did not advance.");
    rows.push(...next);
    after = cursor;
  }
  throw new Error("Report request timed out or was cancelled.");
}

// Bound REST filter URLs as well as response sizes. Every batch must finish;
// a failed later batch rejects the report rather than returning partial rows.
export async function readAllReportBatches<T extends { id: string }>(
  ids: string[],
  page: (ids: string[], after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal: AbortSignal,
): Promise<T[]> {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const batch = uniqueIds.slice(start, start + 100);
    rows.push(...await readAllReportRows((after) => page(batch, after), signal));
  }
  return rows;
}

export function includedReportFindings(findings: InspectionFinding[]) {
  return findings.filter((finding) => finding.review_status !== "dismissed" && finding.detector?.reportIncluded !== false)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
      || a.observed_at.localeCompare(b.observed_at) || a.id.localeCompare(b.id));
}

export function inspectionReportSummary(findings: InspectionFinding[]) {
  const included = includedReportFindings(findings);
  return {
    included: included.length,
    confirmed: included.filter((finding) => finding.review_status === "confirmed").length,
    candidates: included.filter((finding) => finding.review_status !== "confirmed").length,
    urgent: included.filter((finding) => finding.severity === "critical" || finding.severity === "high").length,
  };
}

export function reportEvidenceIds(findings: InspectionFinding[]) {
  const included = includedReportFindings(findings);
  const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
  return {
    current: [...new Set(included.map(findingMediaId).filter(validId))],
    baseline: [...new Set(included.map((finding) => finding.detector?.baselineSourceMediaId).filter(validId))],
  };
}
