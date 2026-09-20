import { supabaseAdmin } from "./supabaseClient";
import type { ExtractedOutput } from "./extractOutputs";

const TYPE_LABEL: Record<ExtractedOutput["type"], string> = {
  orthomosaic: "Orthomosaic",
  "3d_model": "3D Model",
  dsm: "Digital Surface Model (DSM)",
  dtm: "Digital Terrain Model (DTM)",
  contours: "Contour Lines (GeoJSON)",
  contours_shapefile: "Contour Lines (Shapefile)",
  contours_kml: "Contour Lines (KML)",
  contours_dxf: "Contour Lines (DXF)",
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
export interface DeliverableLocation {
  provider: "supabase" | "google_drive";
  storagePath?: string; // set when provider === "supabase"
  externalFileId?: string; // set when provider === "google_drive"
}

export interface PotreeLocation {
  provider: "supabase";
  metadata: string;
  octree: string;
  hierarchy: string;
}

export async function registerDeliverable(
  jobId: string,
  projectName: string,
  output: ExtractedOutput,
  location: DeliverableLocation,
  processingJobId: string,
  potree?: PotreeLocation
): Promise<void> {
  const { data: previousRevision } = await supabaseAdmin
    .from("deliverables")
    .select("id, revision_number, client_status")
    .eq("job_id", jobId)
    .eq("type", output.type)
    .eq("client_status", "revision_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const revisionNumber = previousRevision ? Math.max(2, Number(previousRevision.revision_number ?? 1) + 1) : 1;

  const { data: registered, error } = await supabaseAdmin
    .from("deliverables")
    .upsert(
      {
        job_id: jobId,
        supersedes_deliverable_id: previousRevision?.id ?? null,
        revision_number: revisionNumber,
        name: `${projectName} — ${TYPE_LABEL[output.type]}`,
        type: output.type,
        storage_url: location.provider === "supabase" ? location.storagePath : null,
        storage_provider: location.provider,
        external_file_id: location.provider === "google_drive" ? location.externalFileId : null,
        mapping_processing_job_id: processingJobId,
        ...(potree ? { potree } : {}),
      },
      { onConflict: "mapping_processing_job_id,type", ignoreDuplicates: true }
    )
    .select("id, supersedes_deliverable_id")
    .maybeSingle();
  if (error) throw new Error(`Failed to register deliverable (${output.type}): ${error.message}`);

  if (previousRevision && registered?.id) {
    const { error: supersedeError } = await supabaseAdmin
      .from("deliverables")
      .update({ client_status: "superseded" })
      .eq("id", previousRevision.id)
      .eq("client_status", "revision_requested");
    if (supersedeError) {
      console.warn(`[registerDeliverables] Corrected output registered but prior revision status was not updated: ${supersedeError.message}`);
    }
  }
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
