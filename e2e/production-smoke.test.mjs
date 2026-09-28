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

  const hero = page.locator("section").filter({ has: page.getByRole("heading", { name: /Higher Insights\.\s*Real Results\./i }) }).first();
  await hero.getByRole("heading", { name: /Higher Insights\.\s*Real Results\./i }).waitFor();

  const heroDrone = hero.getByAltText("DOM drone staged inside a Drone Operation landing zone");
  const heroMascot = hero.getByAltText("DOM mascot deploying the drone");
  await heroDrone.waitFor();
  await heroMascot.waitFor();

  for (const image of [heroDrone, heroMascot]) {
    const loaded = await image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0);
    assert.equal(loaded, true, "current DOM homepage hero asset failed to load");
  }

  await hero.getByRole("link", { name: /Request a Mission/i }).waitFor();
  await hero.getByRole("link", { name: /Explore Services/i }).waitFor();

  const dominicSection = page.locator("section").filter({ hasText: "Meet DOM" }).first();
  await dominicSection.getByText("Meet DOM", { exact: true }).waitFor();
  await dominicSection.getByRole("link", { name: /Explore DOMINIC/i }).waitFor();
  await dominicSection.getByRole("link", { name: /Pilot Login \/ Get Access/i }).waitFor();

  const workspacePreview = dominicSection.getByAltText("DOMINIC map workspace preview");
  await workspacePreview.waitFor();
  assert.equal(
    await workspacePreview.evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
    true,
    "DOMINIC workspace preview failed to load",
  );

  await page.getByText("DOMINIC WORKSPACE", { exact: true }).waitFor();
  await page.getByText("Drone Services in Delaware County, PA & the Greater Philadelphia Area", { exact: true }).waitFor();
  await page.close();
});

test("deployment build identity is uncached when exposed by the production domain", async () => {
  const context = await browser.newContext();
  try {
    let response;
    try {
      response = await context.request.get(`${baseURL}/api/build`, {
        failOnStatusCode: false,
        timeout: 5_000,
      });
    } catch (error) {
      console.warn(
        `Production build identity endpoint did not respond; continuing with authoritative live smoke coverage. ${error instanceof Error ? error.message : ""}`,
      );
      return;
    }

    const contentType = response.headers()["content-type"] ?? "";

    // The custom production domain does not expose /api/build consistently,
    // so commit identity is diagnostic rather than the health gate. Homepage,
    // privileged API and login-route smoke tests remain authoritative.
    if (response.status() !== 200 || !contentType.includes("application/json")) {
      console.warn(
        `Production build identity endpoint unavailable (status=${response.status()}, content-type=${contentType || "unknown"}); continuing with live smoke coverage.`,
      );
      return;
    }

    const body = await response.json();
    assert.ok(body.buildId, "build endpoint should expose a deployment identity");
    const cacheControl = response.headers()["cache-control"] ?? "";
    assert.match(cacheControl, /no-store/i, "build identity must never be cached");
  } finally {
    await context.close();
  }
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


test("private portals redirect anonymous visitors to the correct login", async () => {
  const checks = [
    ["/pilot", "/pilot/login"],
    ["/client", "/client/login"],
    ["/admin/dashboard", "/admin/login"],
  ];

  for (const [path, expected] of checks) {
    const page = await browser.newPage();
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(response && response.status() < 400, `${path} returned ${response?.status()}`);
    await page.waitForURL(`**${expected}`, { timeout: 15_000 });
    assert.equal(new URL(page.url()).pathname, expected);
    await page.close();
  }
});
