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

  for (const job of staleJobs) {
    if (job.attempts + 1 >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("mapping_processing_jobs")
        .update({ status: "failed", error_message: `Worker went silent after ${MAX_ATTEMPTS} attempts (last heartbeat before ${staleCutoff}).` })
        .eq("id", job.id);
      await supabaseAdmin
        .from("mapping_projects")
        .update({ status: "failed", error_message: "Processing failed after repeated worker timeouts. Contact DOM ops." })
        .eq("id", job.mapping_project_id);
    } else {
      await supabaseAdmin
        .from("mapping_processing_jobs")
        .update({ status: "queued", worker_id: null, claimed_at: null, attempts: job.attempts + 1 })
        .eq("id", job.id);
    }
    console.log(`[recoverStaleJobs] Recovered stale job ${job.id} (attempt ${job.attempts + 1})`);
  }
}
