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

  await page.getByRole("heading", { name: /Higher Insights\.\s*Real Results\./i }).waitFor();

  const pilotBarrier = page.getByAltText("DOM 4-post Drone Operation pilot protection barrier system");
  const droneBarrier = page.getByAltText("DOM 4-post Drone Operation drone landing zone barrier system");
  await pilotBarrier.waitFor();
  await droneBarrier.waitFor();
  for (const image of [pilotBarrier, droneBarrier]) {
    const loaded = await image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0);
    assert.equal(loaded, true, "actual DOM homepage barrier asset failed to load");
  }
  assert.ok((await pilotBarrier.getAttribute("src"))?.includes("dom-4-post-pilot-protection"), "homepage must use the real DOM pilot-protection product asset");
  assert.ok((await droneBarrier.getAttribute("src"))?.includes("dom-4-post-large-drone-zone"), "homepage must use the real DOM drone-zone product asset");

  await page.getByText("Free Pilot Access", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Pilot Login \/ Get Access/i }).waitFor();
  await page.getByRole("link", { name: /Explore DOMINIC/i }).waitFor();

  const mascot = page.getByAltText("DOM mascot kneeling and presenting DOMINIC mapping software").first();
  await mascot.waitFor();
  const status = await mascot.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return {
      loaded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: style.objectFit,
      opacity: Number(style.opacity || "1"),
      visibility: style.visibility,
      display: style.display,
      width: rect.width,
      height: rect.height,
    };
  });
  assert.equal(status.loaded, true, "DOM mascot image failed to load");
  assert.equal(status.objectFit, "contain", "DOM mascot must remain fully visible");
  assert.notEqual(status.visibility, "hidden", "DOM mascot must not be hidden");
  assert.notEqual(status.display, "none", "DOM mascot must be rendered");
  assert.ok(status.opacity > 0.5, "DOM mascot must be visibly opaque");
  assert.ok(status.width > 180 && status.height > 220, "DOM mascot must be visibly large on homepage");
  assert.ok(status.naturalWidth > 100 && status.naturalHeight > 100, "DOM mascot source asset is unexpectedly tiny");
  assert.equal(await mascot.getAttribute("data-dominic-home-mascot"), "presenting-v1", "homepage must use the purpose-built presenting mascot");
  await page.getByText("Meet DOM", { exact: true }).waitFor();
  await page.close();
});

test("deployment build identity is uncached and available", async () => {
  const context = await browser.newContext();
  const response = await context.request.get(`${baseURL}/api/build`, { failOnStatusCode: false });
  assert.equal(response.status(), 200);
  const body = await response.json();
  assert.ok(body.buildId, "build endpoint should expose a deployment identity");
  const cacheControl = response.headers()["cache-control"] ?? "";
  assert.match(cacheControl, /no-store/i, "build identity must never be cached");
  await context.close();
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
