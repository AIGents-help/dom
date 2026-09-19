import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { env } from "./env";

export interface GeneratedContour {
  type: "contours";
  localPath: string;
  filename: string;
}

// Generate a single-file GeoJSON contour deliverable from a DSM/DTM with
// GDAL. GeoJSON is used here deliberately: unlike an ESRI Shapefile it does
// not require a sidecar bundle (.shp/.shx/.dbf/.prj), which keeps the DOMINIC
// deliverable pipeline atomic. SHP/DXF/DWG export can be derived later.
export async function generateContours(
  sourceRaster: string,
  outPath: string,
  intervalMeters: number
): Promise<GeneratedContour | null> {
  if (!existsSync(sourceRaster)) return null;
  const interval = Number.isFinite(intervalMeters) && intervalMeters > 0 ? intervalMeters : 0.5;

  const ok = await runCommand(env.gdalContourPath, [
    "-f", "GeoJSON",
    "-a", "elevation",
    "-i", String(interval),
    sourceRaster,
    outPath,
  ]);

  if (!ok || !existsSync(outPath)) return null;
  return { type: "contours", localPath: outPath, filename: outPath.split(/[\\/]/).pop() ?? "contours.geojson" };
}

function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      console.error(`[generateContours] Could not launch "${command}": ${err.message}. Set GDAL_CONTOUR_PATH or install GDAL.`);
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[generateContours] "${command}" exited with code ${code}: ${stderr.slice(0, 1200)}`);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}
