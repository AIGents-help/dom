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
export async function registerDeliverable(jobId: string, projectName: string, output: ExtractedOutput, storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.from("deliverables").insert({
    job_id: jobId,
    name: `${projectName} — ${TYPE_LABEL[output.type]}`,
    type: output.type,
    storage_url: storagePath,
  });
  if (error) throw new Error(`Failed to register deliverable (${output.type}): ${error.message}`);
}
