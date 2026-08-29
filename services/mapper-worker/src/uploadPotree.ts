import { readFileSync } from "node:fs";
import { supabaseAdmin } from "./supabaseClient";
import type { PotreeConversionResult } from "./convertPointCloud";

export interface PotreeStorageLocation {
  provider: "supabase";
  metadata: string;
  octree: string;
  hierarchy: string;
}

// Uploads the 3-file Potree 2.x octree into the private mapper-potree
// bucket -- always Supabase Storage regardless of where the master LAZ
// lives (Drive or Supabase), since this derivative needs Range-request-
// capable signed URLs for the viewer (see the bucket migration's comment).
export async function uploadPotreeOctree(jobId: string, processingJobId: string, result: PotreeConversionResult): Promise<PotreeStorageLocation> {
  const prefix = `${jobId}/mapper/potree/${processingJobId}`;
  const files: { key: "metadata" | "octree" | "hierarchy"; localPath: string; name: string }[] = [
    { key: "metadata", localPath: result.metadataPath, name: "metadata.json" },
    { key: "octree", localPath: result.octreePath, name: "octree.bin" },
    { key: "hierarchy", localPath: result.hierarchyPath, name: "hierarchy.bin" },
  ];

  const location = { provider: "supabase" } as PotreeStorageLocation;
  for (const file of files) {
    const path = `${prefix}/${file.name}`;
    const buffer = readFileSync(file.localPath);
    const { error } = await supabaseAdmin.storage.from("mapper-potree").upload(path, buffer, { upsert: true });
    if (error) throw new Error(`Failed to upload Potree ${file.name}: ${error.message}`);
    location[file.key] = path;
  }
  return location;
}
