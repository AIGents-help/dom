import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { env } from "./env";

export interface JobWorkspace {
  root: string;
  imagesDir: string;
  outputDir: string;
  cleanup: () => void;
}

// One isolated temp directory per job, under the configured MAPPER_WORK_DIR
// (never a hard-coded path). Always cleaned up when the job finishes —
// success or failure — so a long-running worker doesn't slowly fill the
// workstation's disk with every job it's ever processed.
export function createJobWorkspace(jobId: string): JobWorkspace {
  if (!existsSync(env.workDir)) mkdirSync(env.workDir, { recursive: true });
  const root = mkdtempSync(join(env.workDir, `job-${jobId}-`));
  const imagesDir = join(root, "images");
  const outputDir = join(root, "output");
  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  return {
    root,
    imagesDir,
    outputDir,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch (err) {
        console.error(`[workspace] Failed to clean up ${root}:`, err);
      }
    },
  };
}

// Fallback root for anything that needs a scratch path before a job has
// been claimed (currently unused, kept for parity with tmpdir() as a
// documented last-resort default — MAPPER_WORK_DIR is always required and
// preferred).
export const SYSTEM_TMP = tmpdir();
