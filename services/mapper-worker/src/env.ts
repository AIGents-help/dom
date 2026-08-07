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
};

export function nodeOdmBaseUrl(): string {
  return `${env.nodeOdmUrl}:${env.nodeOdmPort}`;
}
