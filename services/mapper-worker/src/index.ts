import { env } from "./env";
import { claimNextJob } from "./claimJob";
import { recoverStaleJobs } from "./recoverStaleJobs";
import { processJob } from "./processJob";

// Entry point: `npm start` (or `npm run dev` for auto-restart on change).
// A simple poll loop, not a queue subscription — Postgres/Supabase itself
// is the durable queue, per the architecture decision (no Redis/BullMQ).

let shuttingDown = false;

async function tick(): Promise<void> {
  await recoverStaleJobs();

  const job = await claimNextJob();
  if (!job) return;

  console.log(`[worker] Claimed job ${job.id} (project ${job.mapping_project_id})`);
  await processJob(job);
  console.log(`[worker] Finished job ${job.id}`);
}

async function main(): Promise<void> {
  console.log(`[worker] DOM Mapper worker starting — id=${env.workerId} nodeodm=${env.nodeOdmUrl}:${env.nodeOdmPort} workDir=${env.workDir}`);

  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] Unhandled error in poll loop:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, env.pollIntervalMs));
  }

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
