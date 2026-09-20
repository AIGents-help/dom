import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const baseURL = (process.env.E2E_BASE_URL || "https://droneopsman.com").replace(/\/$/, "");
let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

async function openStablePage(path) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const response = await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  assert.ok(response, `${path} did not return a response`);
  assert.ok(response.status() < 400, `${path} returned HTTP ${response.status()}`);
  assert.equal(pageErrors.length, 0, `${path} raised browser errors: ${pageErrors.join(" | ")}`);

  const applicationErrors = consoleErrors.filter((message) =>
    !message.includes("favicon") && !message.includes("Failed to load resource")
  );
  assert.equal(applicationErrors.length, 0, `${path} logged application errors: ${applicationErrors.join(" | ")}`);
  await page.close();
}

test("public entry points render without browser crashes", async () => {
  for (const path of ["/", "/contact", "/pilot", "/admin"]) await openStablePage(path);
});


test("homepage exposes the approved DOMINIC layout", async () => {
  const page = await browser.newPage();
  const response = await page.goto(`${baseURL}/`, { waitUntil: "networkidle", timeout: 45_000 });
  assert.ok(response && response.status() < 400, `homepage returned ${response?.status()}`);

  await page.getByText("Safety-First Operations", { exact: true }).waitFor();
  await page.getByText("Coming to DOM", { exact: true }).first().waitFor();
  await page.getByText("Meet DOMINIC", { exact: true }).waitFor();
  await page.getByText("Same Perspective. Higher Purpose.", { exact: true }).waitFor();
  await page.getByText("Map. Measure. Analyze. Deliver.", { exact: true }).waitFor();

  const mascots = page.getByAltText("DOMINIC mapping software mascot");
  assert.ok(await mascots.count() >= 2, "homepage should render the approved DOMINIC mascot in both hero and feature promotion");
  for (let index = 0; index < await mascots.count(); index += 1) {
    const loaded = await mascots.nth(index).evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    assert.equal(loaded, true, `DOMINIC mascot image ${index + 1} failed to load`);
  }
  await page.close();
});

test("privileged workflow APIs reject anonymous callers", async () => {
  const context = await browser.newContext();
  const checks = [
    ["POST", "/api/pilot/missions/create", {}],
    ["GET", "/api/pilot/mapping/jobs-eligible"],
    ["POST", "/api/admin/missions/00000000-0000-0000-0000-000000000000/manage", { action: "advance_status" }],
  ];

  for (const [method, path, data] of checks) {
    const response = await context.request.fetch(`${baseURL}${path}`, {
      method,
      data,
      failOnStatusCode: false,
    });
    assert.ok(
      [401, 403].includes(response.status()),
      `${method} ${path} returned ${response.status()} instead of rejecting the anonymous request`,
    );
  }
  await context.close();
});
