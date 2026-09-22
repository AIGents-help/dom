import { hostname, platform, release } from "node:os";
import { env } from "./env";
import { supabaseAdmin } from "./supabaseClient";

export type WorkerStatus = "starting" | "ready" | "processing" | "degraded" | "stopping";

export interface NodeHealthSnapshot {
  workerStatus: WorkerStatus;
  dockerStatus: "unknown" | "starting" | "ready" | "unavailable" | "not_managed";
  nodeOdmStatus: "unknown" | "starting" | "ready" | "unavailable";
  currentJobId?: string | null;
  nodeOdmVersion?: string | null;
  cpuCores?: number | null;
  availableMemory?: number | null;
  queueCount?: number | null;
  lastError?: string | null;
}

export async function reportNode(snapshot: NodeHealthSnapshot): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("mapping_workers").upsert({
    worker_id: env.workerId,
    display_name: env.workerDisplayName,
    status: snapshot.workerStatus,
    docker_status: snapshot.dockerStatus,
    nodeodm_status: snapshot.nodeOdmStatus,
    current_job_id: snapshot.currentJobId ?? null,
    nodeodm_version: snapshot.nodeOdmVersion ?? null,
    cpu_cores: snapshot.cpuCores ?? null,
    available_memory: snapshot.availableMemory ?? null,
    queue_count: snapshot.queueCount ?? null,
    last_error: snapshot.lastError ?? null,
    metadata: { hostname: hostname(), platform: platform(), os_release: release(), agent_version: "1.1.0" },
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: "worker_id" });
  if (error) console.error("[nodeRegistry] Could not report node status:", error.message);
}
