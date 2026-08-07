import { supabaseAdmin } from "./supabaseClient";
import { env } from "./env";

export async function logEvent(mappingProjectId: string, eventType: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from("mapping_events").insert({
    mapping_project_id: mappingProjectId,
    actor_type: "worker",
    actor_id: env.workerId,
    event_type: eventType,
    message,
    metadata: metadata ?? null,
  });
}
