import { basename, join } from "node:path";
import { supabaseAdmin } from "./supabaseClient";
import type { ProcessingJob } from "./claimJob";
import { createJobWorkspace } from "./workspace";
import { listProjectImages, downloadProjectImages } from "./downloadImages";
import { extractAndStoreMetadata } from "./extractMetadata";
import { initTask, uploadImagesToTask, commitTask, getTaskInfo, downloadAllOutputs, NODEODM_STATUS } from "./nodeodm";
import { extractAllZip, locateOutputs } from "./extractOutputs";
import { uploadOutput } from "./uploadOutputs";
import { registerDeliverable, isOutputAlreadyRegistered, type DeliverableLocation } from "./registerDeliverables";
import { startHeartbeat, updateProgress } from "./heartbeat";
import { logEvent } from "./logEvent";
import { env } from "./env";
import { odmProgressToStage } from "./processingStages";
import { isDriveConfigured, resolveProjectFolders, uploadFile, type DriveFolderTree } from "./googleDrive";
import { getProjectDriveContext } from "./projectContext";
import { convertPointCloud } from "./convertPointCloud";
import { uploadPotreeOctree } from "./uploadPotree";
import { buildCogOrthomosaic } from "./buildCogOrthomosaic";
import type { ExtractedOutput } from "./extractOutputs";

const POLL_ODM_INTERVAL_MS = 5000;

const DRIVE_OUTPUT_FOLDER: Record<ExtractedOutput["type"], keyof DriveFolderTree> = {
  orthomosaic: "orthomosaic",
  "3d_model": "model_3d",
  dsm: "elevation",
  dtm: "elevation",
  point_cloud: "point_cloud",
};

interface MappingProjectRow {
  id: string;
  job_id: string;
  name: string;
}

export async function processJob(job: ProcessingJob): Promise<void> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("mapping_projects")
    .select("id, job_id, name")
    .eq("id", job.mapping_project_id)
    .single<MappingProjectRow>();

  if (projectError || !project) {
    console.error(`[processJob] Could not load mapping_project ${job.mapping_project_id}:`, projectError?.message);
    await supabaseAdmin.from("mapping_processing_jobs").update({ status: "failed", error_message: "Mapping project not found." }).eq("id", job.id);
    return;
  }

  const workspace = createJobWorkspace(job.id);
  const stopHeartbeat = startHeartbeat(job.id);
  const nowIso = new Date().toISOString();

  await Promise.all([
    supabaseAdmin.from("mapping_processing_jobs").update({ status: "processing", started_at: nowIso }).eq("id", job.id),
    supabaseAdmin.from("mapping_projects").update({ status: "processing", processing_started_at: nowIso, error_message: null }).eq("id", project.id),
  ]);
  await logEvent(project.id, "processing_started", `Worker ${env.workerId} started processing.`);

  const driveEnabled = isDriveConfigured();
  let driveFolders: DriveFolderTree | null = null;

  try {
    // 1. Preparing Images — download raw imagery locally (Office-PC is
    // temporary processing scratch space only; nothing here is a permanent
    // store), then archive it to Drive if configured.
    await updateProgress(job.id, project.id, 5, "Preparing Images");
    const images = await listProjectImages(project.id);
    if (images.length < 2) throw new Error(`Only ${images.length} image(s) recorded — need at least 2.`);
    const localImagePaths = await downloadProjectImages(images, workspace.imagesDir);

    if (driveEnabled) {
      const driveContext = await getProjectDriveContext(project.job_id);
      driveFolders = await resolveProjectFolders(project.id, driveContext.customerName, driveContext.jobLabel);
      for (let i = 0; i < images.length; i++) {
        try {
          const filename = images[i].original_filename || basename(localImagePaths[i]);
          const fileId = await uploadFile(localImagePaths[i], filename, driveFolders.raw_images);
          await supabaseAdmin.from("mapping_images").update({ external_file_id: fileId, storage_provider: "google_drive" }).eq("id", images[i].id);
        } catch (imgErr) {
          console.error(`[processJob] Job ${job.id}: failed to archive image ${images[i].id} to Drive:`, imgErr instanceof Error ? imgErr.message : imgErr);
        }
      }
    }

    // 2. Reading Metadata — authoritative extraction (worker-side, never
    // trusts the browser).
    await updateProgress(job.id, project.id, 15, "Reading Metadata");
    for (let i = 0; i < images.length; i++) {
      await extractAndStoreMetadata(images[i], localImagePaths[i]);
    }

    // 3. Uploading to Processor — submit to NodeODM.
    await updateProgress(job.id, project.id, 20, "Uploading to Processor");
    const options = Array.isArray(job.options) ? (job.options as { name: string; value: unknown }[]) : [];
    const taskUuid = await initTask(project.name, options);
    await uploadImagesToTask(taskUuid, localImagePaths);
    await commitTask(taskUuid);
    await logEvent(project.id, "nodeodm_task_submitted", `NodeODM task ${taskUuid} submitted (${images.length} images).`, { taskUuid });

    // 4. Poll NodeODM until done. ODM's own 0-100 progress is mapped into
    // our 20-90% range, leaving room for output handling afterward, and
    // bucketed into a human-readable stage name (odmProgressToStage — ODM's
    // real pipeline order, since NodeODM's /info only reports one aggregate
    // number, not a named substage). Reconstruction can run for tens of
    // minutes — a single transient network blip on this GET must not throw
    // away an otherwise-successful run, so a handful of consecutive poll
    // failures are tolerated before giving up.
    let odmStatus: number = NODEODM_STATUS.QUEUED;
    let consecutivePollFailures = 0;
    const MAX_CONSECUTIVE_POLL_FAILURES = 5;
    while (odmStatus === NODEODM_STATUS.QUEUED || odmStatus === NODEODM_STATUS.RUNNING) {
      await new Promise((resolve) => setTimeout(resolve, POLL_ODM_INTERVAL_MS));
      let info;
      try {
        info = await getTaskInfo(taskUuid);
        consecutivePollFailures = 0;
      } catch (pollErr) {
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) throw pollErr;
        continue;
      }
      odmStatus = info.status.code;
      const mapped = 20 + Math.round((info.progress / 100) * 70);
      const stage = odmStatus === NODEODM_STATUS.QUEUED ? "Uploading to Processor" : odmProgressToStage(info.progress);
      await updateProgress(job.id, project.id, mapped, stage);

      if (odmStatus === NODEODM_STATUS.FAILED || odmStatus === NODEODM_STATUS.CANCELED) {
        throw new Error(info.status.errorMessage || `NodeODM task ended with status ${odmStatus}.`);
      }
    }

    // 5. Preparing Deliverables — retrieve, unpack, convert, and register outputs.
    await updateProgress(job.id, project.id, 92, "Preparing Deliverables");
    const zipPath = join(workspace.outputDir, "all.zip");
    await downloadAllOutputs(taskUuid, zipPath);
    extractAllZip(zipPath, workspace.outputDir);
    const outputs = locateOutputs(workspace.outputDir);
    if (outputs.length === 0) {
      throw new Error("NodeODM finished but no recognizable output files were found in all.zip.");
    }

    // One output failing to upload (e.g. an orthomosaic larger than the
    // Storage project's max upload size) must not throw away outputs that
    // did upload fine — same "skip it, log it, don't hard-fail" philosophy
    // extractOutputs.ts already applies to missing output types.
    const registered: string[] = [];
    const skipped: string[] = [];
    for (const output of outputs) {
      try {
        if (await isOutputAlreadyRegistered(job.id, output.type)) {
          console.log(`[processJob] Job ${job.id}: output "${output.type}" already registered on a prior attempt, skipping re-upload.`);
          registered.push(output.type);
          continue;
        }

        // Orthomosaic: try to tile it into a Cloud-Optimized GeoTIFF before
        // upload, so the browser viewer only fetches the resolution/tiles
        // it needs (see buildCogOrthomosaic.ts). Skipped/logged, not fatal,
        // if GDAL isn't installed on this machine — the original GeoTIFF
        // uploads exactly as before in that case.
        let uploadOutput_ = output;
        if (output.type === "orthomosaic") {
          try {
            const cogPath = join(workspace.outputDir, `cog_${output.filename}`);
            const built = await buildCogOrthomosaic(output.localPath, cogPath);
            if (built) uploadOutput_ = { ...output, localPath: built, filename: `cog_${output.filename}` };
          } catch (cogErr) {
            console.error(`[processJob] Job ${job.id}: COG tiling failed, uploading original GeoTIFF:`, cogErr instanceof Error ? cogErr.message : cogErr);
          }
        }

        let location: DeliverableLocation;
        if (driveEnabled && driveFolders) {
          const folderId = driveFolders[DRIVE_OUTPUT_FOLDER[output.type]];
          const externalFileId = await uploadFile(uploadOutput_.localPath, uploadOutput_.filename, folderId);
          location = { provider: "google_drive", externalFileId };
        } else {
          const storagePath = await uploadOutput(project.job_id, uploadOutput_);
          location = { provider: "supabase", storagePath };
        }

        let potree: Awaited<ReturnType<typeof uploadPotreeOctree>> | undefined;
        if (output.type === "point_cloud") {
          const converted = await convertPointCloud(output.localPath, workspace.potreeDir);
          if (converted) {
            try {
              potree = await uploadPotreeOctree(project.job_id, job.id, converted);
            } catch (potreeUploadErr) {
              console.error(`[processJob] Job ${job.id}: Potree octree upload failed:`, potreeUploadErr instanceof Error ? potreeUploadErr.message : potreeUploadErr);
            }
          }
        }

        await registerDeliverable(project.job_id, project.name, output, location, job.id, potree);
        registered.push(output.type);
      } catch (outputErr) {
        const outputMessage = outputErr instanceof Error ? outputErr.message : String(outputErr);
        console.error(`[processJob] Job ${job.id}: output "${output.type}" (${output.filename}) skipped:`, outputMessage);
        skipped.push(`${output.type} (${outputMessage})`);
      }
    }
    if (registered.length === 0) {
      throw new Error(`No outputs could be uploaded: ${skipped.join("; ")}`);
    }

    // 6. Complete
    const doneIso = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("mapping_processing_jobs").update({ status: "completed", progress: 100, current_stage: "Complete", completed_at: doneIso }).eq("id", job.id),
      supabaseAdmin.from("mapping_projects").update({ status: "completed", processing_progress: 100, processing_completed_at: doneIso, processing_stage: "Complete" }).eq("id", project.id),
    ]);
    const summary = `Registered ${registered.length} deliverable(s): ${registered.join(", ")}.` + (skipped.length > 0 ? ` Skipped: ${skipped.join("; ")}.` : "");
    await logEvent(project.id, "processing_completed", summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[processJob] Job ${job.id} failed:`, message);
    await Promise.all([
      supabaseAdmin.from("mapping_processing_jobs").update({ status: "failed", error_message: message }).eq("id", job.id),
      supabaseAdmin.from("mapping_projects").update({ status: "failed", error_message: message }).eq("id", project.id),
    ]);
    await logEvent(project.id, "processing_failed", message);
  } finally {
    stopHeartbeat();
    workspace.cleanup();
  }
}
