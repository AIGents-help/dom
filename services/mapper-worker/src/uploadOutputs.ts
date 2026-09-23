import { closeSync, openSync, readSync, statSync } from "node:fs";
import { extname } from "node:path";
import { env } from "./env";
import type { ExtractedOutput } from "./extractOutputs";

const TUS_VERSION = "1.0.0";
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 3000, 5000, 10000, 20000];

function storageEndpoint(): string {
  const host = new URL(env.supabaseUrl).hostname;
  const projectId = host.split(".")[0];
  if (!projectId) throw new Error(`Could not derive Supabase project id from ${env.supabaseUrl}`);
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function contentType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".glb": return "model/gltf-binary";
    case ".gltf": return "model/gltf+json";
    case ".las":
    case ".laz": return "application/octet-stream";
    case ".tif":
    case ".tiff": return "image/tiff";
    case ".geojson": return "application/geo+json";
    case ".kml": return "application/vnd.google-earth.kml+xml";
    case ".dxf": return "application/dxf";
    case ".zip": return "application/zip";
    default: return "application/octet-stream";
  }
}

function tusHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${env.supabaseServiceRoleKey}`,
    apikey: env.supabaseServiceRoleKey,
    "Tus-Resumable": TUS_VERSION,
  };
}

async function createTusUpload(bucketName: string, objectName: string, size: number, mime: string): Promise<string> {
  const response = await fetch(storageEndpoint(), {
    method: "POST",
    headers: {
      ...tusHeaders(),
      "Upload-Length": String(size),
      "Upload-Metadata": [
        `bucketName ${base64(bucketName)}`,
        `objectName ${base64(objectName)}`,
        `contentType ${base64(mime)}`,
        `cacheControl ${base64("3600")}`,
      ].join(","),
      "x-upsert": "false",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TUS create failed (${response.status}): ${body || response.statusText}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("TUS create succeeded but no upload Location header was returned.");
  return new URL(location, storageEndpoint()).toString();
}

async function patchChunk(uploadUrl: string, chunk: Buffer, offset: number): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          ...tusHeaders(),
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
          "Content-Length": String(chunk.byteLength),
        },
        body: chunk,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`TUS chunk failed (${response.status}): ${body || response.statusText}`);
      }
      const next = Number(response.headers.get("upload-offset"));
      return Number.isFinite(next) ? next : offset + chunk.byteLength;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resumableUpload(localPath: string, bucketName: string, objectName: string, mime: string): Promise<void> {
  const size = statSync(localPath).size;
  const uploadUrl = await createTusUpload(bucketName, objectName, size, mime);
  const fd = openSync(localPath, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const bytesToRead = Math.min(TUS_CHUNK_SIZE, size - offset);
      const chunk = Buffer.allocUnsafe(bytesToRead);
      const read = readSync(fd, chunk, 0, bytesToRead, offset);
      if (read <= 0) throw new Error(`Unexpected EOF while uploading ${objectName} at byte ${offset}.`);
      const payload = read === chunk.byteLength ? chunk : chunk.subarray(0, read);
      offset = await patchChunk(uploadUrl, payload, offset);
      const pct = ((offset / size) * 100).toFixed(1);
      console.log(`[uploadOutput] ${objectName}: ${pct}% (${offset}/${size} bytes)`);
    }
  } finally {
    closeSync(fd);
  }
}

// Finished DOMINIC deliverables can be hundreds of MB or larger. Supabase
// recommends TUS resumable uploads for large files / unstable networks.
// Stream 6 MB chunks directly from disk instead of buffering the whole
// GLB/LAZ into one fetch request.
export async function uploadOutput(jobId: string, output: ExtractedOutput): Promise<string> {
  const storagePath = `${jobId}/mapper/${Date.now()}-${output.filename}`;
  try {
    await resumableUpload(output.localPath, "mission-deliverables", storagePath, contentType(output.filename));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resumably upload ${output.filename} to mission-deliverables: ${message}`);
  }
  return storagePath;
}
