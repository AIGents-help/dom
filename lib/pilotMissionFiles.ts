export const PILOT_UPLOAD_STATUSES = ["accepted", "scheduled", "in_progress", "qc_rejected"] as const;

export type PilotFileKind = "document" | "deliverable";

export const DOCUMENT_CATEGORIES = [
  "authorization",
  "permit",
  "waiver",
  "insurance",
  "site_access",
  "client_contract",
  "laanc",
  "notam",
  "safety",
  "equipment",
  "reference",
  "other",
] as const;

export const DELIVERABLE_TYPES = [
  "orthomosaic",
  "3d_model",
  "point_cloud",
  "report",
  "raw_images",
  "video",
  "other",
] as const;

export const MAX_PILOT_UPLOAD_BYTES = 250 * 1024 * 1024;

export function isPilotFileKind(value: unknown): value is PilotFileKind {
  return value === "document" || value === "deliverable";
}

export function canPilotUpload(status: string): boolean {
  return PILOT_UPLOAD_STATUSES.includes(status as (typeof PILOT_UPLOAD_STATUSES)[number]);
}

export function validPilotFileCategory(kind: PilotFileKind, value: unknown): value is string {
  if (typeof value !== "string") return false;
  return kind === "document"
    ? DOCUMENT_CATEGORIES.includes(value as (typeof DOCUMENT_CATEGORIES)[number])
    : DELIVERABLE_TYPES.includes(value as (typeof DELIVERABLE_TYPES)[number]);
}

export function sanitizeStorageFileName(value: string): string {
  const lastSegment = value.split(/[\\/]/).pop() ?? "file";
  const cleaned = lastSegment
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-\./g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "file";
}

export function pilotStorageConfig(kind: PilotFileKind, missionRequestId: string, jobId: string) {
  return kind === "document"
    ? { bucket: "mission-documents", rootId: missionRequestId }
    : { bucket: "mission-deliverables", rootId: jobId };
}

export function isPathWithinRoot(path: string, rootId: string): boolean {
  return path.startsWith(`${rootId}/`) && !path.includes("..") && !path.includes("\\");
}

export function validatePilotUpload(input: {
  kind: unknown;
  name: unknown;
  category: unknown;
  fileName: unknown;
  fileSize: unknown;
}): string | null {
  if (!isPilotFileKind(input.kind)) return "Choose a valid file type.";
  if (typeof input.name !== "string" || !input.name.trim()) return "Add a clear file name.";
  if (input.name.trim().length > 160) return "File name must be 160 characters or fewer.";
  if (!validPilotFileCategory(input.kind, input.category)) return "Choose a valid category.";
  if (typeof input.fileName !== "string" || !input.fileName.trim()) return "Choose a file to upload.";
  const size = Number(input.fileSize);
  if (!Number.isFinite(size) || size <= 0) return "The selected file is empty.";
  if (size > MAX_PILOT_UPLOAD_BYTES) return "Files must be 250 MB or smaller. Use the Mapping workspace for larger datasets.";
  return null;
}
