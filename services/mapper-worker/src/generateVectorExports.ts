import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import AdmZip from "adm-zip";
import { env } from "./env";
import type { ExtractedOutput } from "./extractOutputs";

export type VectorExportOutput = ExtractedOutput & {
  type: "contours_shapefile" | "contours_kml" | "contours_dxf";
};

export async function generateVectorExports(
  sourcePath: string,
  outputDir: string
): Promise<VectorExportOutput[]> {
  if (!existsSync(sourcePath)) return [];

  const generated: VectorExportOutput[] = [];
  mkdirSync(outputDir, { recursive: true });

  const kmlPath = join(outputDir, "dominic_contours.kml");
  if (await runOgr(["-f", "KML", kmlPath, sourcePath, "-t_srs", "EPSG:4326"])) {
    if (existsSync(kmlPath)) generated.push({ type: "contours_kml", localPath: kmlPath, filename: basename(kmlPath) });
  }

  const dxfPath = join(outputDir, "dominic_contours.dxf");
  if (await runOgr(["-f", "DXF", dxfPath, sourcePath])) {
    if (existsSync(dxfPath)) generated.push({ type: "contours_dxf", localPath: dxfPath, filename: basename(dxfPath) });
  }

  const shpDir = join(outputDir, "contours_shapefile");
  mkdirSync(shpDir, { recursive: true });
  const shpPath = join(shpDir, "dominic_contours.shp");
  if (await runOgr(["-f", "ESRI Shapefile", shpPath, sourcePath])) {
    const zipPath = join(outputDir, "dominic_contours_shapefile.zip");
    const zip = new AdmZip();
    for (const file of readdirSync(shpDir)) {
      const full = join(shpDir, file);
      if (!statSync(full).isFile()) continue;
      const ext = extname(file).toLowerCase();
      if ([".shp", ".shx", ".dbf", ".prj", ".cpg"].includes(ext)) zip.addLocalFile(full);
    }
    zip.writeZip(zipPath);
    if (existsSync(zipPath)) generated.push({ type: "contours_shapefile", localPath: zipPath, filename: basename(zipPath) });
  }

  return generated;
}

function runOgr(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(env.ogr2ogrPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      console.error(`[generateVectorExports] Could not launch "${env.ogr2ogrPath}": ${err.message}. Set OGR2OGR_PATH or install GDAL.`);
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[generateVectorExports] ogr2ogr exited with code ${code}: ${stderr.slice(0, 1200)}`);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}
