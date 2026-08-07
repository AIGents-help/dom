import { createReadStream, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { nodeOdmBaseUrl } from "./env";

// NodeODM REST API client. Every field/endpoint here was verified against
// OpenDroneMap/NodeODM's actual API documentation before writing this —
// not guessed. In particular: /task/{uuid}/download only exposes a single
// documented asset, "all.zip" (a bundle of ODM's full output directory
// tree) — there is no per-artifact download endpoint for e.g. just the
// orthophoto, so extractOutputs.ts unpacks that archive and locates files
// by ODM's standard output layout.

// Status codes per NodeODM's TaskInfo schema.
export const NODEODM_STATUS = { QUEUED: 10, RUNNING: 20, FAILED: 30, COMPLETED: 40, CANCELED: 50 } as const;

export interface NodeOdmTaskInfo {
  uuid: string;
  status: { code: number; errorMessage?: string };
  processingTime: number;
  progress: number;
  imagesCount: number;
  name: string;
  output?: string[];
}

function url(path: string): string {
  return `${nodeOdmBaseUrl()}${path}`;
}

async function fileToBlob(path: string): Promise<Blob> {
  const stat = statSync(path);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (c) => chunks.push(c as Buffer));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return new Blob([Buffer.concat(chunks, stat.size)]);
}

// POST /task/new/init — starts a new task and uploads the initial batch of
// images as multipart form data. Returns the new task's uuid.
export async function initTask(imagePaths: string[], name: string, options: { name: string; value: unknown }[]): Promise<string> {
  const form = new FormData();
  form.append("name", name);
  form.append("options", JSON.stringify(options));
  for (const path of imagePaths) {
    form.append("images", await fileToBlob(path), basename(path));
  }

  const res = await fetch(url("/task/new/init"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`NodeODM /task/new/init failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { uuid?: string; error?: string };
  if (!body.uuid) throw new Error(`NodeODM /task/new/init did not return a uuid: ${JSON.stringify(body)}`);
  return body.uuid;
}

// POST /task/new/commit/{uuid} — commits (starts) a task created via init.
export async function commitTask(uuid: string): Promise<void> {
  const res = await fetch(url(`/task/new/commit/${uuid}`), { method: "POST" });
  if (!res.ok) throw new Error(`NodeODM /task/new/commit failed: ${res.status} ${await res.text()}`);
}

// GET /task/{uuid}/info — current status/progress.
export async function getTaskInfo(uuid: string): Promise<NodeOdmTaskInfo> {
  const res = await fetch(url(`/task/${uuid}/info`));
  if (!res.ok) throw new Error(`NodeODM /task/${uuid}/info failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as NodeOdmTaskInfo;
}

// GET /task/{uuid}/download/all.zip — the one documented download asset.
// Streams the archive to a local file path for extraction.
export async function downloadAllOutputs(uuid: string, destZipPath: string): Promise<void> {
  const res = await fetch(url(`/task/${uuid}/download/all.zip`));
  if (!res.ok) throw new Error(`NodeODM /task/${uuid}/download/all.zip failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destZipPath, buffer);
}
