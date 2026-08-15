import { join } from "node:path";
import { supabaseAdmin } from "./supabaseClient";
import type { ProcessingJob } from "./claimJob";
import { createJobWorkspace } from "./workspace";
import { listProjectImages, downloadProjectImages } from "./downloadImages";
import { extractAndStoreMetadata } from "./extractMetadata";
import { initTask, uploadImagesToTask, commitTask, getTaskInfo, downloadAllOutputs, NODEODM_STATUS } from "./nodeodm";
import { extractAllZip, locateOutputs } from "./extractOutputs";
import { uploadOutput } from "./uploadOutputs";
import { registerDeliverable, isOutputAlreadyRegistered } from "./registerDeliverables";
import { startHeartbeat, updateProgress } from "./heartbeat";
import { logEvent } from "./logEvent";
import { env } from "./env";

const POLL_ODM_INTERVAL_MS = 5000;

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

  try {
    // 1. Download raw imagery
    await updateProgress(job.id, project.id, 5, "Downloading imagery");
    const images = await listProjectImages(project.id);
    if (images.length < 2) throw new Error(`Only ${images.length} image(s) recorded — need at least 2.`);
    const localImagePaths = await downloadProjectImages(images, workspace.imagesDir);

    // 2. Authoritative metadata extraction (worker-side, never trusts the browser)
    await updateProgress(job.id, project.id, 15, "Extracting image metadata");
    for (let i = 0; i < images.length; i++) {
      await extractAndStoreMetadata(images[i], localImagePaths[i]);
    }

    // 3. Submit to NodeODM
    await updateProgress(job.id, project.id, 20, "Submitting to NodeODM");
    const options = Array.isArray(job.options) ? (job.options as { name: string; value: unknown }[]) : [];
    const taskUuid = await initTask(project.name, options);
    await uploadImagesToTask(taskUuid, localImagePaths);
    await commitTask(taskUuid);
    await logEvent(project.id, "nodeodm_task_submitted", `NodeODM task ${taskUuid} submitted (${images.length} images).`, { taskUuid });

    // 4. Poll NodeODM until done. ODM's own 0-100 progress is mapped into
    // our 20-90% range, leaving room for output handling afterward.
    // Reconstruction can run for tens of minutes — a single transient
    // network blip on this GET must not throw away an otherwise-successful
    // run, so a handful of consecutive poll failures are tolerated before
    // giving up.
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
      const stage = odmStatus === NODEODM_STATUS.QUEUED ? "Queued in NodeODM" : "Processing in NodeODM";
      await updateProgress(job.id, project.id, mapped, stage);

      if (odmStatus === NODEODM_STATUS.FAILED || odmStatus === NODEODM_STATUS.CANCELED) {
        throw new Error(info.status.errorMessage || `NodeODM task ended with status ${odmStatus}.`);
      }
    }

    // 5. Retrieve, unpack, and register outputs
    await updateProgress(job.id, project.id, 92, "Retrieving outputs");
    const zipPath = join(workspace.outputDir, "all.zip");
    await downloadAllOutputs(taskUuid, zipPath);
    extractAllZip(zipPath, workspace.outputDir);
    const outputs = locateOutputs(workspace.outputDir);
    if (outputs.length === 0) {
      throw new Error("NodeODM finished but no recognizable output files were found in all.zip.");
    }

    await updateProgress(job.id, project.id, 96, "Uploading outputs");
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
        const storagePath = await uploadOutput(project.job_id, output);
        await registerDeliverable(project.job_id, project.name, output, storagePath, job.id);
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

    // 6. Done
    const doneIso = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("mapping_processing_jobs").update({ status: "completed", progress: 100, completed_at: doneIso }).eq("id", job.id),
      supabaseAdmin.from("mapping_projects").update({ status: "completed", processing_progress: 100, processing_completed_at: doneIso, processing_stage: "Completed" }).eq("id", project.id),
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
