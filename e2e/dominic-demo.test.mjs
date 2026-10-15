import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const enabled = process.env.E2E_ISOLATED_SUPABASE === "true";
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test("public DOMINIC demo mirrors the current project-to-report workflow", { skip: !enabled, timeout: 120000 }, async () => {
  assert.match(base, new RegExp("^https?://(127\\.0\\.0\\.1|localhost)(:|/)"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const mutations = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push({ method: request.method(), url: request.url() });
  });
  try {
    await page.goto(base + "/dominic/demo", { waitUntil: "domcontentloaded" });
    const consent = page.getByRole("region", { name: "Cookie consent", exact: true });
    if (await consent.count()) {
      await consent.getByRole("button", { name: "Essential Only", exact: true }).click();
      await consent.waitFor({ state: "hidden" });
    }
    await page.getByRole("heading", { name: "Your projects", exact: true }).waitFor();
    assert.equal(await page.getByTestId("demo-project-card").count(), 3);
    assert.equal(await page.getByText("VIEW-ONLY SAMPLE", { exact: true }).count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "/tmp/dom-demo-projects-desktop.png", fullPage: true });

    await page.getByRole("button", { name: "Open project", exact: false }).first().click();
    await page.getByRole("heading", { name: "Demo refinery inspection", exact: true }).waitFor();
    await page.getByRole("button", { name: "Review findings", exact: false }).click();
    await page.getByRole("heading", { name: "Tank 17", exact: true }).waitFor();
    await page.getByRole("img", { name: "Sample inspection evidence", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm issue", exact: true }).isDisabled(), true);
    await page.screenshot({ path: "/tmp/dom-demo-review-desktop.png", fullPage: true });

    const nav = page.getByRole("navigation", { name: "DOMINIC navigation", exact: true });
    await nav.getByRole("button", { name: "Capture plans", exact: true }).click();
    await page.getByRole("heading", { name: "Guided capture plan", exact: true }).waitFor();
    await page.getByText("5-waypoint sample route", { exact: true }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/dom-demo-phone.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    await page.setViewportSize({ width: 320, height: 800 });
    await page.screenshot({ path: "/tmp/dom-demo-phone-320.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
  } finally {
    await context.close();
    await browser.close();
  }
});
