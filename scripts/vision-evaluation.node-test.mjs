import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { evaluateDominicVision, visionRegionIoU, VISION_EVALUATION_LIMITS } from "../lib/dominicVisionEvaluation.mjs";
import { parseVisionEvaluationArgs, readVisionDataset, MAX_VISION_DATASET_BYTES } from "./evaluate-vision.mjs";

const box = () => ({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
const truth = (id = "label-1", type = "coating_loss") => ({ id, finding_type: type, region: box() });
const prediction = (type = "coating_loss", confidence = 0.9) => ({ finding_type: type, confidence, region: box() });
const sample = (id = "image-1") => ({
  id, capture_group: "tank-a-pass-1", media_sha256: createHash("sha256").update(id).digest("hex"),
  annotation_complete: true, ground_truth: [truth()], screening: { status: "completed", candidates: [prediction()] },
});
function dataset(samples = [sample()]) {
  return { schema_version: 1,
    dataset: { id: "synthetic-unit-cases", revision: "1", source: "synthetic", split: "development", labeler: "test-fixture" },
    run: { id: "fixture-run", model: "synthetic-no-model", prompt_revision: "none" }, samples };
}

// These tests prove scorer behavior. They are not labeled industrial observations.
test("perfect one-to-one matches are scored without mutating input or inventing validation", () => {
  const input = dataset();
  const before = structuredClone(input);
  const report = evaluateDominicVision(input);
  assert.deepEqual(report.metrics, { true_positives: 1, false_positives: 0, false_negatives: 0, precision: 1, recall: 1, f1: 1 });
  assert.equal(report.dataset.source, "synthetic");
  assert.equal(report.capture_group_count, 1);
  assert.equal(report.samples[0].matches[0].ground_truth_id, "label-1");
  assert.equal(report.clean_images.false_alarm_image_rate, null);
  assert.ok(report.limitations.some((line) => line.includes("not industrial detection accuracy")));
  assert.deepEqual(input, before);
});
test("duplicate predictions cannot match one human annotation twice", () => {
  const input = dataset();
  input.samples[0].screening.candidates.push(prediction());
  const report = evaluateDominicVision(input);
  assert.equal(report.metrics.true_positives, 1);
  assert.equal(report.metrics.false_positives, 1);
  assert.equal(report.metrics.precision, 0.5);
  assert.deepEqual(report.samples[0].false_positives, [{ prediction_index: 1, reason: "duplicate" }]);
});
test("a prediction can match only one of two overlapping human annotations", () => {
  const input = dataset();
  input.samples[0].ground_truth.push(truth("label-2"));
  const report = evaluateDominicVision(input);
  assert.equal(report.metrics.true_positives, 1);
  assert.equal(report.metrics.false_negatives, 1);
  assert.equal(report.metrics.recall, 0.5);
});
test("confidence ordering decides which duplicate is accepted, with stable index ties", () => {
  const input = dataset();
  input.samples[0].screening.candidates = [prediction("coating_loss", 0.6), prediction("coating_loss", 0.95)];
  assert.equal(evaluateDominicVision(input).samples[0].matches[0].prediction_index, 1);
});
test("same box with wrong type counts both a false positive and a missed defect", () => {
  const input = dataset();
  input.samples[0].screening.candidates = [prediction("surface_staining")];
  const report = evaluateDominicVision(input);
  assert.equal(report.metrics.true_positives, 0);
  assert.equal(report.metrics.false_positives, 1);
  assert.equal(report.metrics.false_negatives, 1);
  assert.deepEqual(report.per_type.map((row) => row.finding_type), ["coating_loss", "surface_staining"]);
});
test("identical boxes in different images cannot match", () => {
  const a = sample("a"); a.screening.candidates = [];
  const b = sample("b"); b.ground_truth = [];
  const report = evaluateDominicVision(dataset([a, b]));
  assert.equal(report.metrics.true_positives, 0);
  assert.equal(report.metrics.false_positives, 1);
  assert.equal(report.metrics.false_negatives, 1);
  assert.equal(report.clean_images.false_alarm_image_rate, 1);
});
test("threshold exclusions leave the ground truth in the recall denominator", () => {
  const input = dataset(); input.samples[0].screening.candidates[0].confidence = 0.49;
  const report = evaluateDominicVision(input);
  assert.equal(report.excluded_prediction_count, 1);
  assert.equal(report.metrics.false_negatives, 1);
  assert.equal(report.metrics.precision, null);
  assert.equal(report.metrics.recall, 0);
  assert.equal(report.metrics.f1, 0);
});
test("confidence threshold is inclusive", () => {
  const input = dataset(); input.samples[0].screening.candidates[0].confidence = 0.5;
  assert.equal(evaluateDominicVision(input).metrics.true_positives, 1);
});
test("IoU is exact for identical and disjoint regions and does not use centers alone", () => {
  assert.equal(visionRegionIoU(box(), box()), 1);
  assert.equal(visionRegionIoU(box(), { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }), 0);
  assert.ok(Math.abs(visionRegionIoU({ x: 0, y: 0, width: 0.5, height: 1 }, { x: 0.25, y: 0, width: 0.5, height: 1 }) - 1 / 3) < 1e-12);
});
test("a low-overlap detection fails localization at the specified IoU", () => {
  const input = dataset(); input.samples[0].screening.candidates[0].region = { x: 0.39, y: 0.2, width: 0.3, height: 0.4 };
  assert.equal(evaluateDominicVision(input).metrics.false_negatives, 1);
});
test("null localization is reported explicitly, not dropped", () => {
  const input = dataset(); input.samples[0].screening.candidates[0].region = null;
  const report = evaluateDominicVision(input);
  assert.equal(report.unlocalized_prediction_count, 1);
  assert.equal(report.metrics.false_positives, 1);
  assert.equal(report.metrics.false_negatives, 1);
  assert.equal(report.samples[0].false_positives[0].reason, "unlocalized");
});
test("all-clean data with no candidates yields undefined detection scores, not 100 percent", () => {
  const input = dataset(); input.samples[0].ground_truth = []; input.samples[0].screening.candidates = [];
  const report = evaluateDominicVision(input);
  assert.equal(report.metrics.precision, null);
  assert.equal(report.metrics.recall, null);
  assert.equal(report.metrics.f1, null);
  assert.equal(report.clean_images.false_alarm_image_rate, 0);
});
test("false alarms on clean images are counted by image, not by number of candidates", () => {
  const a = sample("a"); a.ground_truth = []; a.screening.candidates.push(prediction());
  const b = sample("b"); b.ground_truth = []; b.screening.candidates = [];
  const report = evaluateDominicVision(dataset([a, b]));
  assert.equal(report.clean_images.false_alarm_image_rate, 0.5);
  assert.equal(report.metrics.false_positives, 2);
  assert.equal(report.metrics.recall, null);
});
test("more than 1000 recorded images are all included", () => {
  const report = evaluateDominicVision(dataset(Array.from({ length: 1005 }, (_, i) => sample(`image-${i}`))));
  assert.equal(report.image_count, 1005);
  assert.equal(report.samples.length, 1005);
  assert.equal(report.metrics.true_positives, 1005);
});
for (const status of ["pending", "failed", "analyzing", undefined]) {
  test(`incomplete screening (${status}) blocks the entire report`, () => {
    const input = dataset(); input.samples[0].screening.status = status;
    assert.throws(() => evaluateDominicVision(input), /status must be completed/);
  });
}
for (const complete of [false, "true", undefined]) {
  test(`annotation completeness must be explicit (${complete})`, () => {
    const input = dataset(); input.samples[0].annotation_complete = complete;
    assert.throws(() => evaluateDominicVision(input), /annotation_complete/);
  });
}
for (const value of [NaN, Infinity, -1, 2, "0.9", null]) {
  test(`invalid prediction confidence is rejected (${value}) rather than coerced`, () => {
    const input = dataset(); input.samples[0].screening.candidates[0].confidence = value;
    assert.throws(() => evaluateDominicVision(input), /confidence/);
  });
}
for (const value of [undefined, {}, { ...box(), width: 0 }, { ...box(), x: -0.1 }, { ...box(), x: NaN }, { ...box(), x: 0.9 }, { ...box(), y: 0.9 }]) {
  test(`invalid or absent region is rejected (${JSON.stringify(value)})`, () => {
    const input = dataset(); input.samples[0].screening.candidates[0].region = value;
    assert.throws(() => evaluateDominicVision(input), /region/);
  });
}
test("missing candidates or labels are not silently converted to empty arrays", () => {
  const input = dataset(); delete input.samples[0].screening.candidates;
  assert.throws(() => evaluateDominicVision(input), /candidates/);
  const missingLabels = dataset(); delete missingLabels.samples[0].ground_truth;
  assert.throws(() => evaluateDominicVision(missingLabels), /ground_truth/);
});
test("duplicate image IDs or hashes are rejected", () => {
  assert.throws(() => evaluateDominicVision(dataset([sample(), sample()])), /repeats an image/);
  const a = sample("a"); const b = sample("b"); b.media_sha256 = a.media_sha256;
  assert.throws(() => evaluateDominicVision(dataset([a, b])), /repeats an image/);
});
test("duplicate annotation IDs are rejected", () => {
  const input = dataset(); input.samples[0].ground_truth.push(truth());
  assert.throws(() => evaluateDominicVision(input), /duplicated/);
});
test("invalid provenance and empty datasets cannot produce reports", () => {
  assert.throws(() => evaluateDominicVision(dataset([])), /At least one/);
  const input = dataset(); input.dataset.source = "unknown";
  assert.throws(() => evaluateDominicVision(input), /dataset.source/);
  input.dataset.source = "field"; input.dataset.split = "unknown";
  assert.throws(() => evaluateDominicVision(input), /dataset.split/);
});
test("oversized candidate arrays fail instead of truncating false alarms", () => {
  const input = dataset(); input.samples[0].screening.candidates = Array.from({ length: VISION_EVALUATION_LIMITS.itemsPerImage + 1 }, () => prediction());
  assert.throws(() => evaluateDominicVision(input), /at most 100/);
});
for (const options of [{ confidenceThreshold: NaN }, { confidenceThreshold: "0.5" }, { iouThreshold: 0 }, { iouThreshold: Infinity }]) {
  test(`invalid scoring thresholds fail (${JSON.stringify(options)})`, () => {
    assert.throws(() => evaluateDominicVision(dataset(), options), /Threshold/);
  });
}
test("CLI accepts explicit thresholds and rejects typos, duplicates and missing values", () => {
  assert.equal(parseVisionEvaluationArgs(["--help"]).help, true);
  assert.equal(parseVisionEvaluationArgs(["data.json", "--confidence", "0.7", "--iou", "1"]).confidenceThreshold, 0.7);
  for (const args of [[], ["--bad"], ["a", "--iou", "0"], ["a", "--confidence", "NaN"], ["a", "--output"], ["a", "--iou", "0.5", "--iou", "0.6"], ["a", "--bogus", "1"]]) {
    assert.throws(() => parseVisionEvaluationArgs(args));
  }
});
test("CLI generates a fingerprinted report, refuses overwrite and creates no report for invalid data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dominic-eval-"));
  const cli = fileURLToPath(new URL("./evaluate-vision.mjs", import.meta.url));
  try {
    const input = join(dir, "data.json"); const output = join(dir, "report.json");
    const bytes = JSON.stringify(dataset()); await writeFile(input, bytes);
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10_000 });
    const success = run(input, "--output", output); assert.equal(success.status, 0, success.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.input_sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(report.metrics.true_positives, 1);
    assert.equal(run(input, "--output", output).status, 1);
    await writeFile(input, "not JSON");
    const invalid = run(input, "--output", join(dir, "invalid.json"));
    assert.equal(invalid.status, 1); assert.match(invalid.stderr, /not valid JSON/);
    await assert.rejects(readFile(join(dir, "invalid.json")), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("file input size is bounded before allocating or parsing large content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dominic-eval-limit-"));
  try {
    const path = join(dir, "big.json"); const handle = await open(path, "w");
    await handle.truncate(MAX_VISION_DATASET_BYTES + 1); await handle.close();
    await assert.rejects(readVisionDataset(path), /16 MiB/);
    await assert.rejects(readVisionDataset(dir), /regular JSON file/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
