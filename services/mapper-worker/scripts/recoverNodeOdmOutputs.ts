import { join } from "node:path";
import { supabaseAdmin } from "../src/supabaseClient";
import { createJobWorkspace } from "../src/workspace";
import { downloadAllOutputs } from "../src/nodeodm";
import { extractAllZip, locateOutputs, type ExtractedOutput } from "../src/extractOutputs";
import { uploadOutput } from "../src/uploadOutputs";
import { registerDeliverable, isOutputAlreadyRegistered } from "../src/registerDeliverables";
import { dominicDeliverableFilename } from "../src/deliverableBranding";
import { convertPointCloud } from "../src/convertPointCloud";
import { uploadPotreeOctree } from "../src/uploadPotree";

async function main() {
  const [taskUuid, mappingProjectId, processingJobId] = process.argv.slice(2);
  if (!taskUuid || !mappingProjectId || !processingJobId) {
    throw new Error("Usage: npm run recover:deliverables -- <nodeodm-task-uuid> <mapping-project-id> <processing-job-id>");
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("mapping_projects")
    .select("id, job_id, name")
    .eq("id", mappingProjectId)
    .single();
  if (projectError || !project) throw new Error(`Project not found: ${projectError?.message ?? mappingProjectId}`);

  const { data: processingJob, error: jobError } = await supabaseAdmin
    .from("mapping_processing_jobs")
    .select("id, options")
    .eq("id", processingJobId)
    .single();
  if (jobError || !processingJob) throw new Error(`Processing job not found: ${jobError?.message ?? processingJobId}`);

  const options = Array.isArray(processingJob.options) ? processingJob.options as Array<{ name: string; value: unknown }> : [];
  const requested = options.find((option) => option.name === "__dom_requested_outputs")?.value;
  const requestedOutputs = Array.isArray(requested) ? requested.filter((v): v is string => typeof v === "string") : [];

  const wantsOutput = (type: ExtractedOutput["type"]) => {
    if (requestedOutputs.length === 0) return true;
    if (type.startsWith("contours")) return requestedOutputs.includes("contours");
    return requestedOutputs.includes(type);
  };

  const workspace = createJobWorkspace(`recovery-${processingJobId}`);
  try {
    await supabaseAdmin.from("mapping_processing_jobs")
      .update({ status: "processing", progress: 94, current_stage: "Recovering Deliverables", error_message: null })
      .eq("id", processingJobId);
    await supabaseAdmin.from("mapping_projects")
      .update({ status: "processing", processing_progress: 94, processing_stage: "Recovering Deliverables", error_message: null })
      .eq("id", mappingProjectId);

    console.log(`[recover] Downloading completed NodeODM task ${taskUuid}...`);
    const zipPath = join(workspace.outputDir, "all.zip");
    await downloadAllOutputs(taskUuid, zipPath);
    extractAllZip(zipPath, workspace.outputDir);
    const outputs = locateOutputs(workspace.outputDir).filter((output) => wantsOutput(output.type));
    if (outputs.length === 0) throw new Error("No requested deliverables were found in the completed NodeODM task.");

    const registered: string[] = [];
    for (const output of outputs) {
      if (await isOutputAlreadyRegistered(processingJobId, output.type)) {
        registered.push(output.type);
        continue;
      }

      const branded = { ...output, filename: dominicDeliverableFilename(project.name, output) };
      console.log(`[recover] Uploading ${branded.filename} with resumable storage...`);
      const storagePath = await uploadOutput(project.job_id, branded);

      let potree: Awaited<ReturnType<typeof uploadPotreeOctree>> | undefined;
      if (output.type === "point_cloud") {
        const converted = await convertPointCloud(output.localPath, workspace.potreeDir);
        if (converted) {
          try {
            potree = await uploadPotreeOctree(project.job_id, processingJobId, converted);
          } catch (error) {
            console.warn("[recover] Potree conversion/upload skipped:", error instanceof Error ? error.message : error);
          }
        }
      }

      await registerDeliverable(
        project.job_id,
        project.name,
        output,
        { provider: "supabase", storagePath },
        processingJobId,
        potree
      );
      registered.push(output.type);
    }

    if (registered.length === 0) throw new Error("No deliverables were recovered.");

    const now = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("mapping_processing_jobs").update({
        status: "completed", progress: 100, current_stage: "Complete", error_message: null, completed_at: now,
      }).eq("id", processingJobId),
      supabaseAdmin.from("mapping_projects").update({
        status: "completed", processing_progress: 100, processing_stage: "Complete", error_message: null, processing_completed_at: now,
      }).eq("id", mappingProjectId),
      supabaseAdmin.from("mapping_events").insert({
        mapping_project_id: mappingProjectId,
        actor_type: "system",
        event_type: "deliverables_recovered",
        message: `Recovered completed NodeODM outputs without rerunning photogrammetry: ${registered.join(", ")}.`,
        metadata: { taskUuid, processingJobId, outputs: registered },
      }),
    ]);
    console.log(`[recover] COMPLETE — recovered: ${registered.join(", ")}`);
  } finally {
    workspace.cleanup();
  }
}

main().catch((error) => {
  console.error("[recover] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
