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

// Extension order matters for "3d_model": listed most- to least-preferred.
// The DOM Mapper 3D viewer (components/mapper/Model3DViewer.tsx) is a
// three.js GLTFLoader, so when ODM's texturing step produces both a .obj
// and a .glb/.gltf for the same run (it can, depending on version/options),
// picking the raw .obj would make the browser parse a much larger,
// untextured-material-map format for no reason — .glb/.gltf is strictly
// preferred when present. See locateOutputs()'s candidate sort below.
const OUTPUT_HINTS: { type: ExtractedOutput["type"]; dirHint: string; extensions: string[] }[] = [
  { type: "orthomosaic", dirHint: "odm_orthophoto", extensions: [".tif", ".tiff"] },
  { type: "3d_model", dirHint: "odm_texturing", extensions: [".glb", ".gltf", ".obj"] },
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

function extensionRank(file: string, extensions: string[]): number {
  const lower = file.toLowerCase();
  const rank = extensions.findIndex((ext) => lower.endsWith(ext));
  return rank === -1 ? extensions.length : rank;
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
      // Prefer candidates by hint.extensions order (not filesystem walk
      // order, which is arbitrary) — this is what makes .glb win over .obj
      // for "3d_model" when a run produced both.
      const best = candidates
        .slice()
        .sort((a, b) => extensionRank(a, hint.extensions) - extensionRank(b, hint.extensions))[0];
      found.push({ type: hint.type, localPath: best, filename: best.split(/[\\/]/).pop()! });
    }
  }

  return found;
}
