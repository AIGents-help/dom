import { writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { supabaseAdmin } from "./supabaseClient";

export interface MappingImageRow {
  id: string;
  storage_path: string;
  original_filename: string | null;
  sequence_number: number | null;
}

export async function listProjectImages(mappingProjectId: string): Promise<MappingImageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("mapping_images")
    .select("id, storage_path, original_filename, sequence_number")
    .eq("mapping_project_id", mappingProjectId)
    .order("sequence_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list project images: ${error.message}`);
  return data ?? [];
}

// Downloads every raw image for a project from the mapping-uploads bucket
// into the job's local workspace, using the service-role client (bypasses
// RLS — this worker is a trusted, non-browser context). Returns the local
// file paths NodeODM will be pointed at.
export async function downloadProjectImages(images: MappingImageRow[], imagesDir: string): Promise<string[]> {
  const localPaths: string[] = [];
  for (const image of images) {
    const { data, error } = await supabaseAdmin.storage.from("mapping-uploads").download(image.storage_path);
    if (error || !data) {
      throw new Error(`Failed to download ${image.storage_path}: ${error?.message ?? "no data"}`);
    }
    const filename = image.original_filename || basename(image.storage_path);
    const localPath = join(imagesDir, `${image.id}-${filename}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    writeFileSync(localPath, buffer);
    localPaths.push(localPath);
  }
  return localPaths;
}
