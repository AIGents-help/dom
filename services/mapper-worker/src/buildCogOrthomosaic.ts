import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { env } from "./env";

// Re-encodes an orthomosaic GeoTIFF as a tiled Cloud-Optimized GeoTIFF with
// overviews (gdal_translate -of COG, falling back to gdal_translate
// tiling + gdaladdo for older GDAL builds without native COG driver
// support) so the browser viewer (OrthomosaicViewer.tsx, via geotiff.js's
// HTTP-range reads) only fetches the resolution/tiles it actually needs
// instead of the whole file.
//
// Not bundled: requires gdal_translate/gdaladdo installed wherever the
// worker runs (GDAL_TRANSLATE_PATH/GDAL_ADDO_PATH env vars, default
// "gdal_translate"/"gdaladdo" on PATH). If either is missing or the
// command fails, this is skipped and logged -- the original GeoTIFF is
// still uploaded and downloadable exactly as before this feature, same
// "skip it, log it, don't hard-fail" philosophy as extractOutputs.ts.
export async function buildCogOrthomosaic(sourcePath: string, outPath: string): Promise<string | null> {
  if (!existsSync(sourcePath)) return null;

  if (await runCommand(env.gdalTranslatePath, ["-of", "COG", "-co", "COMPRESS=DEFLATE", sourcePath, outPath])) {
    return existsSync(outPath) ? outPath : null;
  }

  // Fallback for GDAL builds without the COG driver: tile the source in
  // place, then build overviews on it directly.
  console.error("[buildCogOrthomosaic] COG driver unavailable, falling back to tiled GeoTIFF + external overviews.");
  const tiledOk = await runCommand(env.gdalTranslatePath, ["-of", "GTiff", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE", sourcePath, outPath]);
  if (!tiledOk || !existsSync(outPath)) return null;

  const overviewsOk = await runCommand(env.gdalAddoPath, ["-r", "average", outPath, "2", "4", "8", "16"]);
  if (!overviewsOk) {
    console.error("[buildCogOrthomosaic] gdaladdo failed -- uploading tiled GeoTIFF without overviews.");
  }
  return outPath;
}

function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      console.error(`[buildCogOrthomosaic] Could not launch "${command}": ${err.message}. Set GDAL_TRANSLATE_PATH/GDAL_ADDO_PATH or install GDAL — orthomosaic will upload untiled.`);
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[buildCogOrthomosaic] "${command}" exited with code ${code}: ${stderr.slice(0, 1000)}`);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}
