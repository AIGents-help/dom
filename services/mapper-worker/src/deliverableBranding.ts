import { extname } from "node:path";
import type { ExtractedOutput } from "./extractOutputs";

const TYPE_SLUG: Record<ExtractedOutput["type"], string> = {
  orthomosaic: "Orthomosaic",
  "3d_model": "3D-Model",
  dsm: "DSM",
  dtm: "DTM",
  contours: "Contours-GeoJSON",
  contours_shapefile: "Contours-Shapefile",
  contours_kml: "Contours-KML",
  contours_dxf: "Contours-DXF",
  point_cloud: "Point-Cloud",
};

export function dominicDeliverableFilename(projectName: string, output: ExtractedOutput): string {
  const project = slug(projectName) || "Project";
  const extension = extname(output.filename).toLowerCase();
  return `DOMINIC_${project}_${TYPE_SLUG[output.type]}${extension}`;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
