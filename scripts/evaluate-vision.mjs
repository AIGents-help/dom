#!/usr/bin/env node
import { open, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateDominicVision } from "../lib/dominicVisionEvaluation.mjs";

export const MAX_VISION_DATASET_BYTES = 16 * 1024 * 1024;
const HELP = `Usage: node scripts/evaluate-vision.mjs dataset.json [--confidence 0.5] [--iou 0.5] [--output report.json]
Offline scoring of saved DOMINIC candidates against complete human annotations.
No network requests, model calls, credentials or aircraft commands. Output files must not already exist.
See docs/dominic-vision-evaluation.md.\n`;

/** @param {string[]} args */
export function parseVisionEvaluationArgs(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  if (!args.length || args[0].startsWith("--")) throw new Error("A dataset JSON path is required. Use --help.");
  const result = { help: false, input: args[0], output: /** @type {string | undefined} */ (undefined),
    confidenceThreshold: 0.5, iouThreshold: 0.5 };
  const seen = new Set();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!["--output", "--confidence", "--iou"].includes(flag) || seen.has(flag) || !value || value.startsWith("--")) {
      throw new Error(`Unknown, repeated or incomplete option: ${flag}.`);
    }
    seen.add(flag);
    if (flag === "--output") result.output = value;
    else {
      if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value) || (flag === "--iou" && Number(value) === 0)) {
        throw new Error(`${flag} must be a decimal ${flag === "--iou" ? "above 0 and" : "between 0 and"} at most 1.`);
      }
      result[flag === "--confidence" ? "confidenceThreshold" : "iouThreshold"] = Number(value);
    }
  }
  return result;
}

/** Read a bounded regular file even if it grows after the size check. @param {string} path */
export async function readVisionDataset(path) {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_VISION_DATASET_BYTES) throw new Error("Input must be a regular JSON file no larger than 16 MiB.");
    const buffer = Buffer.alloc(MAX_VISION_DATASET_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_VISION_DATASET_BYTES) throw new Error("Input grew beyond the 16 MiB limit.");
    const bytes = buffer.subarray(0, length);
    let input;
    try { input = JSON.parse(bytes.toString("utf8")); }
    catch { throw new Error("Input is not valid JSON."); }
    return { input, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await handle.close(); }
}

/** @param {string[]} args */
export async function runVisionEvaluation(args) {
  const options = parseVisionEvaluationArgs(args);
  if (options.help) { process.stdout.write(HELP); return; }
  const { input, sha256 } = await readVisionDataset(/** @type {string} */ (options.input));
  const report = { ...evaluateDominicVision(input, options), input_sha256: sha256 };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (options.output) await writeFile(options.output, json, { flag: "wx", mode: 0o600 });
  else process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runVisionEvaluation(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`DOMINIC evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    process.exitCode = 1;
  });
}
