import { writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { supabaseAdmin } from "./supabaseClient";

export interface MappingImageRow {
  id: string;
  storage_path: string;
  original_filename: string | null;
  sequence_number: number | null;
  file_size: number | null;
}

export interface DownloadProgress {
  downloadedCount: number;
  totalCount: number;
  downloadedBytes: number;
  totalBytes: number;
  currentFilename: string;
}

export async function listProjectImages(mappingProjectId: string): Promise<MappingImageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("mapping_images")
    .select("id, storage_path, original_filename, sequence_number, file_size")
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
export async function downloadProjectImages(
  images: MappingImageRow[],
  imagesDir: string,
  onProgress?: (progress: DownloadProgress) => Promise<void> | void
): Promise<string[]> {
  const localPaths: string[] = [];
  const totalBytes = images.reduce((sum, image) => sum + (Number(image.file_size) || 0), 0);
  let downloadedBytes = 0;
  const MAX_DOWNLOAD_ATTEMPTS = 3;
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const filename = image.original_filename || basename(image.storage_path);
    const localPath = join(imagesDir, `${image.id}-${filename}`);

    await supabaseAdmin
      .from("mapping_images")
      .update({
        lifecycle_status: "downloading",
        lifecycle_error: null,
        lifecycle_updated_at: new Date().toISOString(),
      })
      .eq("id", image.id);

    let buffer: Buffer | null = null;
    let lastError = "unknown download error";

    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from("mapping-uploads")
          .download(image.storage_path);
        if (error || !data) throw new Error(error?.message ?? "no data");

        const candidate = Buffer.from(await data.arrayBuffer());
        const expectedSize = Number(image.file_size) || 0;
        if (expectedSize > 0 && candidate.byteLength !== expectedSize) {
          throw new Error(
            `size mismatch: expected ${expectedSize} bytes, received ${candidate.byteLength} bytes`
          );
        }
        if (candidate.byteLength <= 0) throw new Error("downloaded object is empty");

        buffer = candidate;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(
          `[downloadProjectImages] ${filename} attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS} failed: ${lastError}`
        );
        if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        }
      }
    }

    if (!buffer) {
      await supabaseAdmin
        .from("mapping_images")
        .update({
          lifecycle_status: "failed",
          lifecycle_error: `Download failed after ${MAX_DOWNLOAD_ATTEMPTS} attempts: ${lastError}`,
          lifecycle_updated_at: new Date().toISOString(),
        })
        .eq("id", image.id);
      throw new Error(
        `Failed to download ${image.storage_path} after ${MAX_DOWNLOAD_ATTEMPTS} attempts: ${lastError}`
      );
    }

    writeFileSync(localPath, buffer);
    localPaths.push(localPath);
    downloadedBytes += buffer.byteLength;

    await supabaseAdmin
      .from("mapping_images")
      .update({
        lifecycle_status: "downloaded",
        lifecycle_error: null,
        lifecycle_updated_at: new Date().toISOString(),
      })
      .eq("id", image.id);

    if (onProgress) {
      await onProgress({
        downloadedCount: index + 1,
        totalCount: images.length,
        downloadedBytes,
        totalBytes,
        currentFilename: filename,
      });
    }
  }
  return localPaths;
}
