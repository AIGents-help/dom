import { supabaseAdmin } from "./supabaseClient";

export interface ProjectDriveContext {
  customerName: string;
  jobLabel: string;
}

// Resolves the "<Customer Name>" and "<Job Name - Date>" segments of the
// Drive folder path from the job this mapping project is attached to (see
// MAPPER.md's "why mapping projects attach to jobs" note) — never guessed,
// always the real jobs.title/created_at and clients.company_name.
export async function getProjectDriveContext(jobId: string): Promise<ProjectDriveContext> {
  const { data: job } = await supabaseAdmin.from("jobs").select("title, created_at, client_id").eq("id", jobId).maybeSingle();

  let customerName = "Unknown Customer";
  if (job?.client_id) {
    const { data: client } = await supabaseAdmin.from("clients").select("company_name").eq("id", job.client_id).maybeSingle();
    if (client?.company_name) customerName = client.company_name;
  }

  const dateStr = new Date(job?.created_at ?? Date.now()).toISOString().slice(0, 10);
  const jobLabel = `${job?.title ?? "Job"} - ${dateStr}`;
  return { customerName, jobLabel };
}
