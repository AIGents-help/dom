import { supabaseAdmin } from "./supabaseClient";
import type { ExtractedOutput } from "./extractOutputs";

const TYPE_LABEL: Record<ExtractedOutput["type"], string> = {
  orthomosaic: "Orthomosaic",
  "3d_model": "3D Model",
  dsm: "Digital Surface Model (DSM)",
  dtm: "Digital Terrain Model (DTM)",
  point_cloud: "Point Cloud",
};

// Registers a finished output into the EXISTING `deliverables` table — no
// parallel deliverable system. qc_passed is left at its column default
// (false) intentionally: admin QC/delivery is unchanged by this feature,
// the worker only ever produces the raw output, never marks it customer-
// ready itself.
//
// Idempotent per (mapping_processing_job_id, type): a requeued/retried
// processing job (see recoverStaleJobs.ts) reuses the same
// mapping_processing_jobs.id and re-runs the whole pipeline from scratch,
// so without this a second registerDeliverable() call for the same output
// type would insert a duplicate row. `deliverables_processing_job_type_uidx`
// (see the matching migration) is the actual guarantee; `ignoreDuplicates`
// makes the retry's insert a silent no-op instead of an error.
export async function registerDeliverable(
  jobId: string,
  projectName: string,
  output: ExtractedOutput,
  storagePath: string,
  processingJobId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("deliverables")
    .upsert(
      {
        job_id: jobId,
        name: `${projectName} — ${TYPE_LABEL[output.type]}`,
        type: output.type,
        storage_url: storagePath,
        storage_provider: "supabase",
        mapping_processing_job_id: processingJobId,
      },
      { onConflict: "mapping_processing_job_id,type", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to register deliverable (${output.type}): ${error.message}`);
}

// Lets processJob skip uploading an output it has already registered for
// this exact processing job attempt — avoids leaving an orphaned duplicate
// object in mission-deliverables on a retry, on top of the DB-level
// idempotency above.
export async function isOutputAlreadyRegistered(processingJobId: string, type: ExtractedOutput["type"]): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("deliverables")
    .select("id")
    .eq("mapping_processing_job_id", processingJobId)
    .eq("type", type)
    .maybeSingle();
  if (error) {
    console.error(`[registerDeliverables] Could not check existing registration for ${type}:`, error.message);
    return false;
  }
  return !!data;
}
