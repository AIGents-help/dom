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
const controls = (page) => page.getByRole("region", { name: "2. Set scoring thresholds", exact: true });
// Next.js has its own route-announcer alert. Check only the lab's error region.
const errorAlert = (page) => controls(page).getByRole("alert");
const exportLink = (page) => page.getByRole("link", { name: "Export scored JSON", exact: true });
const start = (page) => page.getByRole("button", { name: "Run evaluation", exact: true }).click();
const complete = async (page) => {
  await start(page);
  await page.getByRole("heading", { name: "3. Evaluation results", exact: true }).waitFor({ timeout: 15000 });
};
const loadExample = (page) => page.getByRole("button", { name: "Load synthetic example", exact: true }).click();
const selectJson = (page, name, text) => page.getByLabel("Labeled dataset JSON (maximum 16 MiB)")
  .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
function heldWorker() {
  window.__workers = [];
  window.__terminated = 0;
  window.Worker = class {
    constructor() { window.__workers.push(this); }
    postMessage() {}
    terminate() { window.__terminated++; }
  };
}

test("Accuracy Lab browser acceptance", { skip: !enabled, timeout: 120000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  // Each case starts with fresh state. A failed assertion cannot leave invalid
  // thresholds or an unfinished worker behind for the remaining cases.
  const check = async (name, execute, configure = async () => {}) => {
    await t.test(name, async () => {
      const context = await browser.newContext({ acceptDownloads: true });
      const mutations = [];
      context.on("request", (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(request.url());
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        await configure(page);
        await page.goto(`${base}/dominic/evaluation`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "DOMINIC Accuracy Lab", exact: true }).waitFor();
        // Use the real consent control, not a forced click, injected consent or
        // hidden banner. Cancellation must be reachable through the actual UI.
        const consent = page.getByRole("region", { name: "Cookie consent", exact: true });
        await consent.getByRole("button", { name: "Essential Only", exact: true }).click();
        await consent.waitFor({ state: "hidden" });
        await execute(page);
        assert.equal(mutations.length, 0, "Evaluation must not upload data or call an AI endpoint");
      } finally { await context.close(); }
    });
  };
  try {
    await check("real bundled worker scores and exports synthetic input", async (page) => {
      await loadExample(page);
      await complete(page);
      assert.match(await page.getByRole("article", { name: "Localization precision", exact: true }).innerText(), /50.0%/);
      assert.match(await page.getByRole("note").innerText(), /SYNTHETIC DATA/);
      const [download] = await Promise.all([page.waitForEvent("download"), exportLink(page).click()]);
      const report = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(report.metrics.true_positives, 1);
      assert.equal(report.metrics.false_positives, 1);
      assert.match(report.input_sha256, /^[a-f0-9]{64}$/);
      await page.screenshot({ path: "/tmp/dom-accuracy-lab-desktop.png", fullPage: true });
    });
    await check("changing thresholds clears stale results and rejects empty confidence", async (page) => {
      await loadExample(page);
      await complete(page);
      await page.getByLabel("Minimum confidence (0 to 1)").fill("");
      await exportLink(page).waitFor({ state: "hidden" });
      await start(page);
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /Confidence must/);
      await page.getByLabel("Minimum confidence (0 to 1)").fill("0.5");
      await errorAlert(page).waitFor({ state: "hidden" });
      await complete(page);
    });
    await check("1005 images render twelve rows, remain searchable, and fit a phone", async (page) => {
      const text = JSON.stringify(dataset(1005));
      await selectJson(page, "large.json", text);
      await complete(page);
      assert.equal(await page.getByTestId("evaluation-sample").count(), 12);
      await page.getByRole("button", { name: "Last images", exact: true }).click();
      await page.getByRole("navigation", { name: "images pages", exact: true }).getByText("Page 84 of 84", { exact: true }).waitFor();
      assert.equal(await page.getByTestId("evaluation-sample").count(), 9);
      await page.getByLabel("Search image or capture group").fill("image-1004");
      await page.getByText("1 matching images; at most 12 shown per page.", { exact: true }).waitFor();
      assert.equal(await page.getByTestId("evaluation-sample").count(), 1);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.screenshot({ path: "/tmp/dom-accuracy-lab-phone.png", fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "No horizontal phone overflow");
      const [download] = await Promise.all([page.waitForEvent("download"), exportLink(page).click()]);
      const report = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(report.samples.length, 1005);
      assert.equal(report.input_sha256, createHash("sha256").update(text).digest("hex"));
      assert.equal(report.metrics.recall, null);
    });
    await check("invalid files remove the earlier report and fail explicitly", async (page) => {
      await loadExample(page);
      await complete(page);
      const data = dataset(); data.samples[0].screening.status = "failed";
      await selectJson(page, "failed.json", JSON.stringify(data));
      await exportLink(page).waitFor({ state: "hidden" });
      await start(page);
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /status must be completed/);
      await selectJson(page, "malformed.json", "not json");
      await start(page);
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /valid UTF-8 JSON/);
    });
    await check("a held worker can be cancelled without retaining its late reply", async (page) => {
      await loadExample(page);
      await start(page);
      await page.getByRole("button", { name: "Cancel evaluation", exact: true }).click();
      assert.match(await controls(page).getByRole("status").innerText(), /cancelled/);
      assert.equal(await page.evaluate(() => window.__terminated), 1);
      await page.evaluate(() => window.__workers[0].onmessage({ data: { ok: false, error: "late stale reply" } }));
      assert.equal(await errorAlert(page).count(), 0);
      assert.equal(await exportLink(page).count(), 0);
    }, (page) => page.addInitScript(heldWorker));
    await check("threshold and dataset changes stop active workers and ignore superseded results", async (page) => {
      await loadExample(page);
      await start(page);
      await page.getByLabel("Minimum confidence (0 to 1)").fill("0.6");
      await page.getByRole("button", { name: "Cancel evaluation", exact: true }).waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => window.__terminated), 1);
      await start(page);
      await page.evaluate(() => window.__workers[0].onmessage({ data: { ok: false, error: "old run" } }));
      assert.equal(await errorAlert(page).count(), 0);
      await selectJson(page, "replacement.json", JSON.stringify(dataset()));
      await page.getByRole("button", { name: "Cancel evaluation", exact: true }).waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => window.__terminated), 2);
      await page.evaluate(() => window.__workers[1].onmessage({ data: { ok: false, error: "replaced dataset" } }));
      assert.equal(await errorAlert(page).count(), 0);
      assert.equal(await exportLink(page).count(), 0);
    }, (page) => page.addInitScript(heldWorker));
    await check("a stalled worker stops at the deadline without exposing a report", async (page) => {
      await loadExample(page);
      await start(page);
      await page.getByRole("button", { name: "Cancel evaluation", exact: true }).waitFor();
      await page.clock.fastForward(31000);
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /30-second limit/);
      assert.equal(await page.evaluate(() => window.__terminated), 1);
      assert.equal(await exportLink(page).count(), 0);
    }, async (page) => { await page.clock.install(); await page.addInitScript(heldWorker); });
    await check("worker load and message errors fail without synchronous scoring", async (page) => {
      await loadExample(page);
      await start(page);
      await page.evaluate(() => window.__workers[0].onerror(new Event("error", { cancelable: true })));
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /worker could not run/);
      await start(page);
      await page.evaluate(() => window.__workers[1].onmessageerror());
      await errorAlert(page).waitFor();
      assert.match(await errorAlert(page).innerText(), /result could not be read/);
      assert.equal(await page.evaluate(() => window.__terminated), 2);
      assert.equal(await exportLink(page).count(), 0);
    }, (page) => page.addInitScript(heldWorker));
  } finally { await browser.close(); }
});
