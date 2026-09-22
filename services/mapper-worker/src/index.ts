import { env } from "./env";
import { claimNextJob } from "./claimJob";
import { recoverStaleJobs } from "./recoverStaleJobs";
import { processJob } from "./processJob";
import { ensureProcessingRuntime } from "./runtimeManager";
import { reportNode } from "./nodeRegistry";

// Entry point: `npm start` (or `npm run dev` for auto-restart on change).
// A simple poll loop, not a queue subscription — Postgres/Supabase itself
// is the durable queue, per the architecture decision (no Redis/BullMQ).

let shuttingDown = false;

async function tick(): Promise<void> {
  await recoverStaleJobs();

  const runtime = await ensureProcessingRuntime();
  await reportNode({
    workerStatus: runtime.ready ? "ready" : "degraded",
    dockerStatus: runtime.dockerStatus,
    nodeOdmStatus: runtime.nodeOdmStatus,
    nodeOdmVersion: runtime.info?.engineVersion ?? null,
    cpuCores: runtime.info?.cpuCores ?? null,
    availableMemory: runtime.info?.availableMemory ?? null,
    queueCount: runtime.info?.taskQueueCount ?? null,
    lastError: runtime.error,
  });
  if (!runtime.ready) {
    console.warn("[worker] Processing runtime unavailable:", runtime.error);
    return;
  }

  const job = await claimNextJob();
  if (!job) return;

  console.log(`[worker] Claimed job ${job.id} (project ${job.mapping_project_id})`);
  await reportNode({
    workerStatus: "processing",
    dockerStatus: runtime.dockerStatus,
    nodeOdmStatus: runtime.nodeOdmStatus,
    currentJobId: job.id,
    nodeOdmVersion: runtime.info?.engineVersion ?? null,
    cpuCores: runtime.info?.cpuCores ?? null,
    availableMemory: runtime.info?.availableMemory ?? null,
    queueCount: runtime.info?.taskQueueCount ?? null,
  });
  await processJob(job);
  await reportNode({
    workerStatus: "ready",
    dockerStatus: runtime.dockerStatus,
    nodeOdmStatus: runtime.nodeOdmStatus,
    currentJobId: null,
    nodeOdmVersion: runtime.info?.engineVersion ?? null,
    cpuCores: runtime.info?.cpuCores ?? null,
    availableMemory: runtime.info?.availableMemory ?? null,
    queueCount: runtime.info?.taskQueueCount ?? null,
  });
  console.log(`[worker] Finished job ${job.id}`);
}

async function main(): Promise<void> {
  console.log(`[worker] DOMINIC Processing Node starting — id=${env.workerId} nodeodm=${env.nodeOdmUrl}:${env.nodeOdmPort} workDir=${env.workDir}`);
  await reportNode({ workerStatus: "starting", dockerStatus: "starting", nodeOdmStatus: "starting" });

  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] Unhandled error in poll loop:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, env.pollIntervalMs));
  }

  await reportNode({ workerStatus: "stopping", dockerStatus: "unknown", nodeOdmStatus: "unknown" });
  console.log("[worker] Shut down cleanly.");
}

function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}, finishing current tick then exiting…`);
  shuttingDown = true;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exitCode = 1;
});
