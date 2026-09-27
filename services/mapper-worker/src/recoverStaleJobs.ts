import { supabaseAdmin } from "./supabaseClient";

// A worker that dies mid-job (crash, power loss, network partition) leaves
// its mapping_processing_jobs row stuck at 'claimed'/'processing' forever
// unless something resets it. Run before every claim attempt, by every
// worker — this UPDATE is safe to run concurrently from multiple workers
// (no race condition like claiming has, since resetting an already-reset
// row is a harmless no-op) and needs no dedicated RPC.
//
// A job is considered stale once its heartbeat is older than
// STALE_THRESHOLD_MS. Jobs that have already failed MAX_ATTEMPTS times are
// marked 'failed' outright instead of being requeued forever.
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // matches lib/mapperPipeline.ts DEFAULT_STALE_THRESHOLD_MS
const MAX_ATTEMPTS = 3;

export async function recoverStaleJobs(): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: staleJobs, error } = await supabaseAdmin
    .from("mapping_processing_jobs")
    .select("id, attempts, mapping_project_id")
    .in("status", ["claimed", "processing"])
    .lt("heartbeat_at", staleCutoff);

  if (error) {
    console.error("[recoverStaleJobs] Failed to query stale jobs:", error.message);
    return;
  }
  if (!staleJobs || staleJobs.length === 0) return;

  const transientImageStates = ["downloading", "downloaded", "metadata_checked", "processor_uploading", "processing"];

  for (const job of staleJobs) {
    const nextAttempt = job.attempts + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      const failureMessage = `Worker went silent after ${MAX_ATTEMPTS} attempts (last heartbeat before ${staleCutoff}).`;
      await Promise.all([
        supabaseAdmin
          .from("mapping_processing_jobs")
          .update({
            status: "failed",
            error_message: failureMessage,
            worker_id: null,
          })
          .eq("id", job.id),
        supabaseAdmin
          .from("mapping_projects")
          .update({
            status: "failed",
            error_message: "Processing failed after repeated worker timeouts. Contact DOM ops.",
          })
          .eq("id", job.mapping_project_id),
        supabaseAdmin
          .from("mapping_images")
          .update({
            lifecycle_status: "failed",
            lifecycle_error: failureMessage,
            lifecycle_updated_at: new Date().toISOString(),
          })
          .eq("mapping_project_id", job.mapping_project_id)
          .in("lifecycle_status", transientImageStates),
      ]);
    } else {
      await Promise.all([
        supabaseAdmin
          .from("mapping_processing_jobs")
          .update({
            status: "queued",
            worker_id: null,
            claimed_at: null,
            heartbeat_at: null,
            started_at: null,
            error_message: null,
            attempts: nextAttempt,
          })
          .eq("id", job.id),
        supabaseAdmin
          .from("mapping_projects")
          .update({
            status: "queued",
            error_message: null,
            processing_stage: "Waiting for worker retry",
          })
          .eq("id", job.mapping_project_id),
        supabaseAdmin
          .from("mapping_images")
          .update({
            lifecycle_status: "stored",
            lifecycle_error: null,
            lifecycle_updated_at: new Date().toISOString(),
          })
          .eq("mapping_project_id", job.mapping_project_id)
          .in("lifecycle_status", transientImageStates),
      ]);
    }
    console.log(`[recoverStaleJobs] Recovered stale job ${job.id} (attempt ${nextAttempt})`);
  }
}
