import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "./env";
import { getNodeInfo, type NodeOdmInfo } from "./nodeodm";

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = "dominic-nodeodm";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isLocalNodeOdm(): boolean {
  return /localhost|127\.0\.0\.1/i.test(env.nodeOdmUrl);
}

async function dockerReady(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function startDockerDesktop(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const candidates = [
    "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
    (process.env.LOCALAPPDATA || "") + "\\Docker\\Docker Desktop.exe",
  ];
  for (const path of candidates) {
    if (!path || path.startsWith("\\Docker")) continue;
    try {
      await access(path);
      const child = spawn(path, [], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    } catch {}
  }
  return false;
}

async function waitForDocker(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await dockerReady()) return true;
    await sleep(3000);
  }
  return false;
}

async function ensureContainer(): Promise<void> {
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER_NAME], { timeout: 10000 });
    if (stdout.trim() === "true") return;
    await execFileAsync("docker", ["start", CONTAINER_NAME], { timeout: 30000 });
    return;
  } catch {}
  await execFileAsync("docker", [
    "run", "-d", "--name", CONTAINER_NAME, "--restart", "unless-stopped",
    "-p", env.nodeOdmPort + ":3000", env.nodeOdmImage,
  ], { timeout: 120000 });
}

async function waitForNodeOdm(timeoutMs: number): Promise<NodeOdmInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await getNodeInfo(); } catch { await sleep(3000); }
  }
  return null;
}

export interface RuntimeHealth {
  ready: boolean;
  dockerStatus: "unknown" | "starting" | "ready" | "unavailable" | "not_managed";
  nodeOdmStatus: "unknown" | "starting" | "ready" | "unavailable";
  info: NodeOdmInfo | null;
  error: string | null;
}

export async function ensureProcessingRuntime(): Promise<RuntimeHealth> {
  try {
    const existing = await getNodeInfo().catch(() => null);
    if (existing) return {
      ready: true,
      dockerStatus: env.manageNodeOdm && isLocalNodeOdm() ? "ready" : "not_managed",
      nodeOdmStatus: "ready", info: existing, error: null,
    };

    if (!env.manageNodeOdm || !isLocalNodeOdm()) return {
      ready: false, dockerStatus: "not_managed", nodeOdmStatus: "unavailable", info: null,
      error: "Configured NodeODM endpoint is not reachable.",
    };

    let docker = await dockerReady();
    if (!docker) {
      console.log("[runtime] Docker is not ready; attempting to start Docker Desktop.");
      await startDockerDesktop();
      docker = await waitForDocker(env.runtimeStartupTimeoutMs);
    }
    if (!docker) return {
      ready: false, dockerStatus: "unavailable", nodeOdmStatus: "unavailable", info: null,
      error: "Docker is not available on this processing node.",
    };

    await ensureContainer();
    const info = await waitForNodeOdm(env.runtimeStartupTimeoutMs);
    if (!info) return {
      ready: false, dockerStatus: "ready", nodeOdmStatus: "unavailable", info: null,
      error: "NodeODM container started but its API did not become ready.",
    };

    return { ready: true, dockerStatus: "ready", nodeOdmStatus: "ready", info, error: null };
  } catch (error) {
    return {
      ready: false, dockerStatus: "unavailable", nodeOdmStatus: "unavailable", info: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
