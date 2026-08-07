import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";

// NodeODM's only documented download asset is the single "all.zip" bundle
// (verified — there's no per-artifact endpoint). Its contents follow
// OpenDroneMap's standard pipeline output directory layout, but exact
// filenames can vary across ODM versions/options (e.g. textured model as
// .obj vs .glb, whether a DSM/DTM/report were generated at all). Rather
// than assert one hard-coded path per output and fail outright when a
// version doesn't match, this searches by directory-name hint + file
// extension and simply omits any output type it can't find — the deliverable
// types the worker knows how to register are exactly the ones it locates.

export interface ExtractedOutput {
  type: "orthomosaic" | "3d_model" | "dsm" | "dtm" | "point_cloud";
  localPath: string;
  filename: string;
}

const OUTPUT_HINTS: { type: ExtractedOutput["type"]; dirHint: string; extensions: string[] }[] = [
  { type: "orthomosaic", dirHint: "odm_orthophoto", extensions: [".tif", ".tiff"] },
  { type: "3d_model", dirHint: "odm_texturing", extensions: [".obj", ".glb", ".gltf"] },
  { type: "dsm", dirHint: "odm_dem", extensions: [".tif", ".tiff"] }, // filtered further by "dsm" in filename below
  { type: "dtm", dirHint: "odm_dem", extensions: [".tif", ".tiff"] }, // filtered further by "dtm" in filename below
  { type: "point_cloud", dirHint: "odm_georeferencing", extensions: [".laz", ".las", ".ply"] },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function extractAllZip(zipPath: string, destDir: string): void {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export function locateOutputs(extractedDir: string): ExtractedOutput[] {
  if (!existsSync(extractedDir)) return [];
  const allFiles = walk(extractedDir);
  const found: ExtractedOutput[] = [];

  for (const hint of OUTPUT_HINTS) {
    const candidates = allFiles.filter((f) => {
      const lower = f.toLowerCase();
      const inHintDir = lower.includes(hint.dirHint);
      const hasExt = hint.extensions.some((ext) => lower.endsWith(ext));
      if (!inHintDir || !hasExt) return false;
      if (hint.type === "dsm") return lower.includes("dsm");
      if (hint.type === "dtm") return lower.includes("dtm");
      return true;
    });
    if (candidates.length > 0) {
      found.push({ type: hint.type, localPath: candidates[0], filename: candidates[0].split(/[\\/]/).pop()! });
    }
  }

  return found;
}
