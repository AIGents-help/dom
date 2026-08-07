import { readFileSync } from "node:fs";
import exifr from "exifr";
import { supabaseAdmin } from "./supabaseClient";
import type { MappingImageRow } from "./downloadImages";

// The one place in this whole feature that writes authoritative camera/GPS
// metadata. The browser-side uploader deliberately never sends
// camera_make/camera_model/captured_at/latitude/longitude/altitude — those
// columns stay null until this runs, per the architecture decision ("do not
// pretend browser EXIF values are authoritative").
export async function extractAndStoreMetadata(image: MappingImageRow, localPath: string): Promise<void> {
  let exif: Record<string, unknown> | null = null;
  try {
    exif = await exifr.parse(readFileSync(localPath), { gps: true, exif: true, tiff: true });
  } catch (err) {
    console.error(`[extractMetadata] Could not parse EXIF for ${image.original_filename ?? image.id}:`, err);
  }
  if (!exif) return;

  const capturedAt = exif.DateTimeOriginal ?? exif.CreateDate ?? exif.ModifyDate ?? null;

  await supabaseAdmin
    .from("mapping_images")
    .update({
      camera_make: typeof exif.Make === "string" ? exif.Make.trim() : null,
      camera_model: typeof exif.Model === "string" ? exif.Model.trim() : null,
      captured_at: capturedAt instanceof Date ? capturedAt.toISOString() : null,
      latitude: typeof exif.latitude === "number" ? exif.latitude : null,
      longitude: typeof exif.longitude === "number" ? exif.longitude : null,
      altitude: typeof exif.GPSAltitude === "number" ? exif.GPSAltitude : null,
      metadata: exif,
    })
    .eq("id", image.id);
}
