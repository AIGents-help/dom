import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const enabled = process.env.E2E_ISOLATED_SUPABASE === "true";
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
function dataset(count = 1) {
  return { schema_version: 1, dataset: { id: "synthetic-ui-fixture", revision: "1", source: "synthetic", split: "development", labeler: "fixture" },
    run: { id: "fixture", model: "no-model-executed", prompt_revision: "none" },
    samples: Array.from({ length: count }, (_, i) => ({ id: `image-${i}`, capture_group: "browser-test", media_sha256: createHash("sha256").update(String(i)).digest("hex"), annotation_complete: true,
      ground_truth: [], screening: { status: "completed", candidates: [] } })) };
}

test("Accuracy Lab browser acceptance", { skip: !enabled, timeout: 120000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const mutations = [];
  page.on("request", (request) => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(request.url()); });
  const visit = async () => {
    await page.goto(`${base}/dominic/evaluation`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "DOMINIC Accuracy Lab", exact: true }).waitFor();
  };
  const complete = async () => {
    await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
    await page.getByRole("heading", { name: "3. Evaluation results", exact: true }).waitFor({ timeout: 15000 });
  };
  try {
    await t.test("real bundled worker scores and exports synthetic input", async () => {
      await visit();
      await page.getByRole("button", { name: "Load synthetic example" }).click();
      await complete();
      assert.match(await page.getByRole("article", { name: "Localization precision", exact: true }).innerText(), /50.0%/);
      assert.match(await page.getByRole("note").innerText(), /SYNTHETIC DATA/);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export scored JSON" }).click()]);
      const report = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(report.metrics.true_positives, 1); assert.equal(report.metrics.false_positives, 1);
      assert.match(report.input_sha256, /^[a-f0-9]{64}$/);
      assert.equal(mutations.length, 0, "Evaluation must not upload data or call an AI endpoint");
      await page.screenshot({ path: "/tmp/dom-accuracy-lab-desktop.png", fullPage: true });
    });
    await t.test("changing thresholds clears stale results and rejects empty confidence", async () => {
      await page.getByLabel("Minimum confidence (0 to 1)").fill("");
      assert.equal(await page.getByRole("link", { name: "Export scored JSON" }).count(), 0);
      await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /Confidence must/);
      await page.getByLabel("Minimum confidence (0 to 1)").fill("0.5");
    });
    await t.test("1005 images render twelve rows, remain searchable, and fit a phone", async () => {
      const text = JSON.stringify(dataset(1005));
      await page.getByLabel("Labeled dataset JSON (maximum 16 MiB)").setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.from(text) });
      await complete();
      assert.equal(await page.getByTestId("evaluation-sample").count(), 12);
      await page.getByRole("button", { name: "Last images", exact: true }).click();
      assert.equal(await page.getByTestId("evaluation-sample").count(), 9);
      await page.getByLabel("Search image or capture group").fill("image-1004");
      assert.equal(await page.getByTestId("evaluation-sample").count(), 1);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.screenshot({ path: "/tmp/dom-accuracy-lab-phone.png", fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "No horizontal phone overflow");
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export scored JSON" }).click()]);
      const report = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(report.samples.length, 1005);
      assert.equal(report.input_sha256, createHash("sha256").update(text).digest("hex"));
      assert.equal(report.metrics.recall, null);
    });
    await t.test("invalid files remove the earlier report and fail explicitly", async () => {
      const data = dataset(); data.samples[0].screening.status = "failed";
      await page.getByLabel("Labeled dataset JSON (maximum 16 MiB)").setInputFiles({ name: "failed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
      assert.equal(await page.getByRole("link", { name: "Export scored JSON" }).count(), 0);
      await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /status must be completed/);
      await page.getByLabel("Labeled dataset JSON (maximum 16 MiB)").setInputFiles({ name: "malformed.json", mimeType: "application/json", buffer: Buffer.from("not json") });
      await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /valid UTF-8 JSON/);
    });
    await t.test("a held worker can be cancelled without retaining its late reply", async () => {
      const delayed = await context.newPage();
      await delayed.addInitScript(() => {
        window.__terminated = 0;
        window.Worker = class {
          constructor() { window.__worker = this; }
          postMessage() {}
          terminate() { window.__terminated++; }
        };
      });
      await delayed.goto(`${base}/dominic/evaluation`, { waitUntil: "domcontentloaded" });
      await delayed.getByRole("button", { name: "Load synthetic example" }).click();
      await delayed.getByRole("button", { name: "Run evaluation", exact: true }).click();
      await delayed.getByRole("button", { name: "Cancel evaluation" }).click();
      assert.match(await delayed.getByRole("status").innerText(), /cancelled/);
      assert.equal(await delayed.evaluate(() => window.__terminated), 1);
      await delayed.evaluate(() => window.__worker.onmessage({ data: { ok: false, error: "late stale reply" } }));
      assert.equal(await delayed.getByRole("alert").count(), 0);
      assert.equal(await delayed.getByRole("link", { name: "Export scored JSON" }).count(), 0);
      await delayed.close();
    });
    assert.equal(mutations.length, 0);
  } finally { await context.close(); await browser.close(); }
});
