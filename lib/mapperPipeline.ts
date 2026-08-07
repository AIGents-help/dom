// lib/mapperPipeline.ts
// Pure, framework-free logic for the DOM Mapper module: project/processing
// status vocab, upload/queue eligibility, and small formatting helpers.
// Mirrors the lib/leadsPipeline.ts pattern in this repo — nothing here
// touches Supabase, so it's shared cleanly between the pilot UI, the API
// routes, and unit tests.

export interface MappingProject {
  id: string;
  job_id: string;
  contractor_id: string;
  name: string;
  location_snapshot: string | null;
  latitude: number | null;
  longitude: number | null;
  status: MappingProjectStatus;
  image_count: number;
  total_upload_bytes: number;
  processing_progress: number;
  processing_stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
}

export interface MappingImage {
  id: string;
  mapping_project_id: string;
  storage_path: string;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  checksum: string | null;
  sequence_number: number | null;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  camera_make: string | null;
  camera_model: string | null;
  image_width: number | null;
  image_height: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MappingProcessingJob {
  id: string;
  mapping_project_id: string;
  status: ProcessingJobStatus;
  worker_id: string | null;
  attempts: number;
  priority: number;
  processor: string;
  processor_version: string | null;
  options: Record<string, unknown> | null;
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  queued_at: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Status vocab
// ---------------------------------------------------------------------------

export const MAPPING_PROJECT_STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "border-slate-500 bg-slate-500/10 text-slate-300" },
  { value: "uploading", label: "Uploading", color: "border-sky-500 bg-sky-500/10 text-sky-400" },
  { value: "uploaded", label: "Uploaded", color: "border-cyan-500 bg-cyan-500/10 text-cyan-400" },
  { value: "queued", label: "Queued", color: "border-amber-500 bg-amber-500/10 text-amber-400" },
  { value: "processing", label: "Processing", color: "border-purple-500 bg-purple-500/10 text-purple-400" },
  { value: "completed", label: "Completed", color: "border-green-500 bg-green-500/10 text-green-400" },
  { value: "failed", label: "Failed", color: "border-rose-500 bg-rose-500/10 text-rose-400" },
  { value: "cancelled", label: "Cancelled", color: "border-slate-600 bg-slate-600/10 text-slate-400" },
] as const;
export type MappingProjectStatus = (typeof MAPPING_PROJECT_STATUS_OPTIONS)[number]["value"];
export const MAPPING_PROJECT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  MAPPING_PROJECT_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const PROCESSING_JOB_STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "claimed", label: "Claimed" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUS_OPTIONS)[number]["value"];

// Deliverable types the mapper worker can produce. `deliverables.type` has
// no DB constraint (verified live) — this is purely the app-level list,
// kept here as the single source of truth so the admin missions page and
// any mapper UI reference the same vocabulary instead of drifting.
export const MAPPER_DELIVERABLE_TYPES = ["orthomosaic", "3d_model", "dsm", "dtm", "point_cloud", "processing_report"] as const;

// A project can't be re-queued while a job for it is already in flight, and
// terminal states (completed/failed/cancelled) require an explicit new
// project rather than silently re-queuing the same one.
export const QUEUEABLE_PROJECT_STATUSES: readonly MappingProjectStatus[] = ["draft", "uploading", "uploaded", "failed"];
export const UPLOADABLE_PROJECT_STATUSES: readonly MappingProjectStatus[] = ["draft", "uploading", "uploaded"];
export const TERMINAL_PROJECT_STATUSES: readonly MappingProjectStatus[] = ["completed", "cancelled"];

export function canUploadImages(project: Pick<MappingProject, "status">): boolean {
  return UPLOADABLE_PROJECT_STATUSES.includes(project.status);
}

export function canQueueProcessing(project: Pick<MappingProject, "status" | "image_count">): { ok: boolean; reason?: string } {
  if (!QUEUEABLE_PROJECT_STATUSES.includes(project.status)) {
    return { ok: false, reason: `Can't queue processing from status "${MAPPING_PROJECT_STATUS_LABELS[project.status] ?? project.status}".` };
  }
  if (project.image_count < 2) {
    return { ok: false, reason: "Upload at least 2 images before queuing processing." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stale-claim recovery — a worker that dies mid-job leaves its
// mapping_processing_jobs row stuck at status='claimed'/'processing' with a
// heartbeat that stops advancing. This is the pure "is it stale" check;
// recovery itself (resetting the row back to 'queued' and incrementing
// attempts) is a DB operation, done via a small SQL statement the worker
// or a cron can run using this same threshold.
// ---------------------------------------------------------------------------

export const DEFAULT_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes without a heartbeat

export function isStaleProcessingJob(
  job: Pick<MappingProcessingJob, "status" | "heartbeat_at" | "claimed_at">,
  now: number,
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): boolean {
  if (job.status !== "claimed" && job.status !== "processing") return false;
  const lastSignal = job.heartbeat_at ?? job.claimed_at;
  if (!lastSignal) return true;
  return now - new Date(lastSignal).getTime() > staleThresholdMs;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

export function formatProgress(progress: number): string {
  const clamped = Math.max(0, Math.min(100, progress));
  return `${Math.round(clamped)}%`;
}
