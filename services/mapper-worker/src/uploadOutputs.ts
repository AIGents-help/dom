import { readFileSync } from "node:fs";
import { supabaseAdmin } from "./supabaseClient";
import type { ExtractedOutput } from "./extractOutputs";

// Uploads finished outputs into the EXISTING mission-deliverables bucket —
// no new bucket for finished outputs, per the architecture decision. Object
// path follows the real, live `{job_id}/...` folder convention already
// enforced by that bucket's storage.objects RLS policy (verified before
// building this feature, not guessed): `${jobId}/mapper/${filename}`.
export async function uploadOutput(jobId: string, output: ExtractedOutput): Promise<string> {
  const buffer = readFileSync(output.localPath);
  const storagePath = `${jobId}/mapper/${Date.now()}-${output.filename}`;

  const { error } = await supabaseAdmin.storage.from("mission-deliverables").upload(storagePath, buffer, { upsert: false });
  if (error) throw new Error(`Failed to upload ${output.filename} to mission-deliverables: ${error.message}`);

  return storagePath;
}
