import { createReadStream, createWriteStream, existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
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

// POST /task/new/init — creates a new task (metadata only, per NodeODM's
// swagger spec at /swagger.json: this endpoint does NOT accept image files;
// attaching an "images" field here is rejected with {"error":"Unexpected
// field"}). Returns the new task's uuid; images are added afterward via
// uploadImagesToTask, then the task is started via commitTask.
export async function initTask(name: string, options: { name: string; value: unknown }[]): Promise<string> {
  const form = new FormData();
  form.append("name", name);
  form.append("options", JSON.stringify(options));

  const res = await fetch(url("/task/new/init"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`NodeODM /task/new/init failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { uuid?: string; error?: string };
  if (!body.uuid) throw new Error(`NodeODM /task/new/init did not return a uuid: ${JSON.stringify(body)}`);
  return body.uuid;
}

const UPLOAD_BATCH_SIZE = 20;

// POST /task/new/upload/{uuid} — adds images to a task created via
// /task/new/init. Called once per batch (repeatable, per the documented API).
export async function uploadImagesToTask(uuid: string, imagePaths: string[]): Promise<void> {
  for (let i = 0; i < imagePaths.length; i += UPLOAD_BATCH_SIZE) {
    const batch = imagePaths.slice(i, i + UPLOAD_BATCH_SIZE);
    const form = new FormData();
    for (const path of batch) {
      form.append("images", await fileToBlob(path), basename(path));
    }
    const res = await fetch(url(`/task/new/upload/${uuid}`), { method: "POST", body: form });
    if (!res.ok) throw new Error(`NodeODM /task/new/upload/${uuid} failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { success?: boolean; error?: string };
    if (!body.success) throw new Error(`NodeODM /task/new/upload/${uuid} did not report success: ${JSON.stringify(body)}`);
  }
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
// Large ODM archives can be hundreds of MB or several GB. Do not route them
// through fetch().arrayBuffer(): undici can abort long/large localhost
// transfers and buffering duplicates the entire archive in RAM. Stream the
// response directly to disk with Node's native HTTP client instead.
export async function downloadAllOutputs(uuid: string, destZipPath: string): Promise<void> {
  const sourceUrl = url(`/task/${uuid}/download/all.zip`);
  const partPath = `${destZipPath}.part`;
  if (existsSync(partPath)) unlinkSync(partPath);

  await new Promise<void>((resolve, reject) => {
    const download = (target: string, redirects = 0) => {
      const parsed = new URL(target);
      const get = parsed.protocol === "https:" ? httpsGet : httpGet;
      const req = get(parsed, (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 5) {
            reject(new Error("NodeODM output download exceeded 5 redirects."));
            return;
          }
          download(new URL(res.headers.location, parsed).toString(), redirects + 1);
          return;
        }

        if (status !== 200) {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => reject(new Error(
            `NodeODM /task/${uuid}/download/all.zip failed: ${status}${body ? ` ${body.slice(0, 500)}` : ""}`
          )));
          return;
        }

        const total = Number(res.headers["content-length"] ?? 0);
        let received = 0;
        let lastLoggedPct = -1;
        const file = createWriteStream(partPath);

        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct >= lastLoggedPct + 5 || pct === 100) {
              lastLoggedPct = pct;
              console.log(`[nodeodm] Downloading all.zip: ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);
            }
          } else if (received % (100 * 1024 * 1024) < chunk.length) {
            console.log(`[nodeodm] Downloading all.zip: ${(received / 1024 / 1024).toFixed(1)} MB`);
          }
        });

        res.on("error", (error) => {
          file.destroy();
          reject(error);
        });
        file.on("error", reject);
        file.on("finish", () => {
          file.close(() => {
            renameSync(partPath, destZipPath);
            console.log(`[nodeodm] all.zip download complete: ${(received / 1024 / 1024).toFixed(1)} MB`);
            resolve();
          });
        });

        res.pipe(file);
      });

      req.setTimeout(30 * 60 * 1000, () => {
        req.destroy(new Error("NodeODM output download timed out after 30 minutes."));
      });
      req.on("error", reject);
    };

    download(sourceUrl);
  }).catch((error) => {
    if (existsSync(partPath)) unlinkSync(partPath);
    throw error;
  });
}
