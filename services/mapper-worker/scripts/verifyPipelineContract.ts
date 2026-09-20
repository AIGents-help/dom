import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { locateOutputs } from "../src/extractOutputs";

function touch(path: string) { writeFileSync(path, "fixture"); }
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "dominic-pipeline-"));
try {
  const dirs = [
    "odm_orthophoto",
    "odm_texturing",
    "odm_dem",
    "odm_georeferencing",
  ];
  dirs.forEach((dir) => mkdirSync(join(root, dir), { recursive: true }));

  touch(join(root, "odm_orthophoto", "odm_orthophoto.tif"));
  touch(join(root, "odm_texturing", "odm_textured_model.obj"));
  touch(join(root, "odm_texturing", "odm_textured_model.glb"));
  touch(join(root, "odm_dem", "dsm.tif"));
  touch(join(root, "odm_dem", "dtm.tif"));
  touch(join(root, "odm_dem", "contours.geojson"));
  touch(join(root, "odm_georeferencing", "odm_georeferenced_model.laz"));

  const outputs = locateOutputs(root);
  const byType = new Map(outputs.map((output) => [output.type, output]));

  for (const required of ["orthomosaic", "3d_model", "dsm", "dtm", "contours", "point_cloud"]) {
    expect(byType.has(required as never), `DOMINIC pipeline contract missing ${required}`);
  }
  expect(byType.get("3d_model")?.filename.endsWith(".glb"), "DOMINIC must prefer GLB over OBJ when both exist.");
  expect(byType.get("dsm")?.filename === "dsm.tif", "DSM locator selected the wrong raster.");
  expect(byType.get("dtm")?.filename === "dtm.tif", "DTM locator selected the wrong raster.");

  console.log("DOMINIC pipeline contract verified:", [...byType.keys()].join(", "));
} finally {
  rmSync(root, { recursive: true, force: true });
}
