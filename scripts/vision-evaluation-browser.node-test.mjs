import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { evaluateDominicVision } from "../lib/dominicVisionEvaluation.mjs";
import { prepareBrowserVisionEvaluation, parseEvaluationThresholds, evaluationSamplePage, MAX_BROWSER_EVALUATION_BYTES } from "../lib/dominicVisionEvaluationBrowser.mjs";

function dataset(count = 1) {
  return { schema_version: 1, dataset: { id: "synthetic-browser", revision: "1", source: "synthetic", split: "development", labeler: "fixture" },
    run: { id: "fixture", model: "no-model-executed", prompt_revision: "none" },
    samples: Array.from({ length: count }, (_, i) => ({ id: `image-${i}`, capture_group: "group-1", media_sha256: createHash("sha256").update(String(i)).digest("hex"), annotation_complete: true,
      ground_truth: [], screening: { status: "completed", candidates: [] } })) };
}
test("browser preparation has exact scorer parity and fingerprints original bytes", async () => {
  const input = dataset(); const text = JSON.stringify(input, null, 2) + "\n";
  const { report, reportJson } = await prepareBrowserVisionEvaluation(new Blob([text]), {});
  assert.deepEqual(report, { ...evaluateDominicVision(input), input_sha256: createHash("sha256").update(text).digest("hex") });
  assert.deepEqual(JSON.parse(reportJson), report);
  assert.equal(report.metrics.precision, null);
});
test("invalid and empty files cannot produce scored reports", async () => {
  for (const file of [new Blob([]), new Blob(["{"]), new Blob([new Uint8Array([0xff])])]) {
    await assert.rejects(prepareBrowserVisionEvaluation(file, {}));
  }
});
test("oversized files fail before reading their bytes", async () => {
  const file = new Blob([new Uint8Array(MAX_BROWSER_EVALUATION_BYTES + 1)]);
  file.arrayBuffer = async () => { throw new Error("must not read"); };
  await assert.rejects(prepareBrowserVisionEvaluation(file, {}), /16 MiB/);
});
test("failed screening cannot turn into a clean-image score", async () => {
  const input = dataset(); input.samples[0].screening.status = "failed";
  await assert.rejects(prepareBrowserVisionEvaluation(new Blob([JSON.stringify(input)]), {}), /status must be completed/);
});
test("an unannotated image cannot turn into a clean-image score", async () => {
  const input = dataset(); input.samples[0].annotation_complete = false;
  await assert.rejects(prepareBrowserVisionEvaluation(new Blob([JSON.stringify(input)]), {}), /annotation_complete/);
});
test("1005 images remain scored while page rows are bounded to twelve", () => {
  const report = { ...evaluateDominicVision(dataset(1005)), input_sha256: "unused" };
  assert.equal(evaluationSamplePage(report, "", false, 0).rows.length, 12);
  const last = evaluationSamplePage(report, "", false, 10000);
  assert.equal(last.total, 1005); assert.equal(last.pageCount, 84); assert.equal(last.rows.length, 9);
  assert.equal(last.rows.at(-1).id, "image-1004");
  assert.equal(evaluationSamplePage(report, "image-1004", false, 50).rows[0].id, "image-1004");
  assert.equal(evaluationSamplePage(report, "missing", false, 50).rows.length, 0);
  assert.equal(evaluationSamplePage(report, "", false, NaN).page, 0);
});
test("error filters retain both missed annotations and unmatched candidates", () => {
  const input = dataset(3); const region = { x: 0, y: 0, width: 0.5, height: 0.5 };
  input.samples[0].ground_truth.push({ id: "label-1", finding_type: "coating_loss", region });
  input.samples[1].screening.candidates.push({ finding_type: "coating_loss", region, confidence: 0.9 });
  const report = { ...evaluateDominicVision(input), input_sha256: "unused" };
  assert.deepEqual(evaluationSamplePage(report, "", true, 0).rows.map((row) => row.id), ["image-0", "image-1"]);
  assert.equal(evaluationSamplePage(report, " GROUP-1 ", true, 0).total, 2);
});
test("threshold input rejects blanks and coercion, and includes zero confidence", () => {
  assert.deepEqual(parseEvaluationThresholds("0", "1"), { confidenceThreshold: 0, iouThreshold: 1 });
  for (const values of [["", "0.5"], ["0.5", "0"], ["NaN", "1"], [" 0.5", "1"], ["1.1", "1"], ["0x1", "1"]]) {
    assert.throws(() => parseEvaluationThresholds(...values));
  }
});
