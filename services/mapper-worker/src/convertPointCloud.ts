import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

export interface PotreeConversionResult {
  metadataPath: string;
  octreePath: string;
  hierarchyPath: string;
}

// Shells out to PotreeConverter 2.x (verified CLI: `PotreeConverter <input>
// -o <outputDir>`) to turn a LAZ/LAS point cloud into its compact 2.x
// octree format -- exactly three output files (metadata.json, octree.bin,
// hierarchy.bin), not the thousands-of-small-files layout of 1.x -- small
// enough to upload as regular objects instead of needing a tile server.
// Already proven against the real Toledo LAZ (odm_georeferenced_model.laz,
// 10.78M points) on the processing workstation.
//
// Not bundled: this requires PotreeConverter installed wherever the worker
// runs (POTREE_CONVERTER_PATH env var, defaults to "PotreeConverter" on
// PATH). If it's missing or fails, conversion is skipped and logged -- the
// point_cloud deliverable stays LAZ-only, exactly as before this feature,
// same "skip it, log it, don't hard-fail" philosophy as extractOutputs.ts.
export async function convertPointCloud(lazPath: string, outDir: string): Promise<PotreeConversionResult | null> {
  if (!existsSync(lazPath)) return null;
  mkdirSync(outDir, { recursive: true });

  const ok = await runPotreeConverter(lazPath, outDir);
  if (!ok) return null;

  const metadataPath = join(outDir, "metadata.json");
  const octreePath = join(outDir, "octree.bin");
  const hierarchyPath = join(outDir, "hierarchy.bin");
  if (!existsSync(metadataPath) || !existsSync(octreePath) || !existsSync(hierarchyPath)) {
    console.error(`[convertPointCloud] PotreeConverter ran but expected output files are missing in ${outDir}.`);
    return null;
  }
  return { metadataPath, octreePath, hierarchyPath };
}

function runPotreeConverter(lazPath: string, outDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(env.potreeConverterPath, [lazPath, "-o", outDir], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      console.error(
        `[convertPointCloud] Could not launch PotreeConverter ("${env.potreeConverterPath}"): ${err.message}. Set POTREE_CONVERTER_PATH or install it — point cloud deliverable will stay LAZ-only.`
      );
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[convertPointCloud] PotreeConverter exited with code ${code}: ${stderr.slice(0, 2000)}`);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}
