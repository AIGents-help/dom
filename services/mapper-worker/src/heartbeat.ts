import { supabaseAdmin } from "./supabaseClient";

// Periodic heartbeat while a job is claimed/processing — this is what lets
// recoverStaleJobs() tell a genuinely-dead worker apart from one that's
// just doing slow, legitimate work. Also used to push a progress/stage
// update to both the processing job row and its parent mapping_projects
// row in one call, since the pilot UI polls mapping_projects for the
// summary and mapping_processing_jobs for the detail.
export function startHeartbeat(jobId: string, intervalMs = 15000): () => void {
  const timer = setInterval(async () => {
    await supabaseAdmin.from("mapping_processing_jobs").update({ heartbeat_at: new Date().toISOString() }).eq("id", jobId);
  }, intervalMs);
  return () => clearInterval(timer);
}

export async function updateProgress(
  jobId: string,
  mappingProjectId: string,
  progress: number,
  stage: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from("mapping_processing_jobs").update({ progress, current_stage: stage, heartbeat_at: nowIso }).eq("id", jobId),
    supabaseAdmin.from("mapping_projects").update({ processing_progress: progress, processing_stage: stage }).eq("id", mappingProjectId),
  ]);
}
