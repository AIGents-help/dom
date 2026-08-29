import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Hand-rolled .env.local loader — same tiny approach the main DOM repo's
// scripts/*.ts already use (no dotenv dependency), since this worker also
// runs outside any framework that would auto-load it.
function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

loadEnvLocal();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required env var ${name}. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  nodeOdmUrl: process.env.NODEODM_URL || "http://localhost",
  nodeOdmPort: process.env.NODEODM_PORT || "3001",
  workerId: required("MAPPER_WORKER_ID"),
  workDir: required("MAPPER_WORK_DIR"),
  pollIntervalMs: parseInt(process.env.MAPPER_POLL_INTERVAL_MS || "10000", 10),
  // Google Drive archive layer — all optional. Unset means isDriveConfigured()
  // is false and the worker stays on the original Supabase-only path.
  //
  // Required configuration: OAuth 2.0 on behalf of the DOM owner's own
  // Google account (a personal Google One account, not Workspace) — files
  // are created as that human user and consume their storage. The refresh
  // token comes from a one-time interactive authorization
  // (scripts/authorizeGoogleDrive.ts), not from anything checked into the
  // repo. See services/mapper-worker/README.md's "Google Drive setup".
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
  googleDriveRefreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "",
  googleDriveRootParentId: process.env.GOOGLE_DRIVE_ROOT_PARENT_ID || "",
  // Optional future enterprise path: a Workspace service account + Shared
  // Drive, only used if the OAuth vars above are absent. A bare service
  // account has no Drive storage quota of its own on a personal account,
  // which is why this is not the primary path (see the README section).
  googleDriveClientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL || "",
  googleDrivePrivateKey: (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  googleDriveSharedDriveId: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || "",
  // PotreeConverter 2.x binary — optional. Unset (or not found on PATH)
  // means the point-cloud-to-octree conversion step is skipped and logged,
  // not a hard failure (see convertPointCloud.ts).
  potreeConverterPath: process.env.POTREE_CONVERTER_PATH || "PotreeConverter",
  // gdal_translate/gdaladdo — optional. Unset means the orthomosaic COG
  // tiling step is skipped and logged (see buildCogOrthomosaic.ts); the
  // original GeoTIFF is still uploaded and downloadable either way.
  gdalTranslatePath: process.env.GDAL_TRANSLATE_PATH || "gdal_translate",
  gdalAddoPath: process.env.GDAL_ADDO_PATH || "gdaladdo",
};

export function nodeOdmBaseUrl(): string {
  return `${env.nodeOdmUrl}:${env.nodeOdmPort}`;
}
