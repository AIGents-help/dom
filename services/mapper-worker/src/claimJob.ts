import { supabaseAdmin } from "./supabaseClient";
import { env } from "./env";

export interface ProcessingJob {
  id: string;
  mapping_project_id: string;
  status: string;
  worker_id: string | null;
  attempts: number;
  priority: number;
  processor: string;
  processor_version: string | null;
  options: Record<string, unknown> | null;
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  queued_at: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
}

// Calls the claim_mapping_processing_job() RPC, which does a single atomic
// `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)` — two
// workers polling at the same instant physically cannot claim the same row.
// Returns null if there's nothing queued right now.
export async function claimNextJob(): Promise<ProcessingJob | null> {
  const { data, error } = await supabaseAdmin.rpc("claim_mapping_processing_job", { p_worker_id: env.workerId });
  if (error) {
    console.error("[claimJob] RPC error:", error.message);
    return null;
  }
  // The RPC returns a single row (or a row of nulls if nothing matched) —
  // supabase-js surfaces this as either null or an object; guard both.
  if (!data || !data.id) return null;
  return data as ProcessingJob;
}
