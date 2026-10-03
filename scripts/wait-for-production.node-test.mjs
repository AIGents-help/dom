import assert from "node:assert/strict";
import { test } from "node:test";
import { probeProduction, waitForProduction } from "./wait-for-production.mjs";

const expectedSHA = "a".repeat(40);
const oldSHA = "b".repeat(40);
const buildResponse = (buildId, cacheControl = "no-store") => Response.json(
  { buildId }, { headers: { "Cache-Control": cacheControl } },
);

test("an older healthy build cannot satisfy production readiness", async () => {
  const result = await probeProduction("https://example.com", expectedSHA, async (url, options) => {
    assert.equal(url.pathname, "/api/build");
    assert.equal(url.searchParams.get("expected"), expectedSHA);
    assert.equal(options.redirect, "follow");
    assert.equal(options.headers["Cache-Control"], "no-cache");
    return buildResponse(oldSHA);
  });
  assert.equal(result.ready, false);
  assert.match(result.reason, /Serving b/);
});

test("exact commit requires uncached identity", async () => {
  assert.equal((await probeProduction("https://example.com", expectedSHA, async () => buildResponse(expectedSHA))).ready, true);
  assert.equal((await probeProduction("https://example.com", expectedSHA, async () => buildResponse(expectedSHA, "public, max-age=3600"))).ready, false);
});

test("missing endpoint, HTML, invalid JSON, local identity and network failure cannot pass", async () => {
  for (const fetchImpl of [
    async () => new Response("missing", { status: 404 }),
    async () => new Response("<html>Healthy</html>", { headers: { "Content-Type": "text/html" } }),
    async () => new Response("{bad json", { headers: { "Content-Type": "application/json" } }),
    async () => buildResponse("local"),
    async () => { throw new Error("request timeout"); },
  ]) {
    assert.equal((await probeProduction("https://example.com", expectedSHA, fetchImpl)).ready, false);
  }
});

test("waits through old build and transient error before the merged commit arrives", async () => {
  let elapsed = 0;
  let attempts = 0;
  await waitForProduction({
    baseURL: "https://example.com",
    expectedSHA,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return buildResponse(oldSHA);
      if (attempts === 2) throw new Error("temporary network error");
      return buildResponse(expectedSHA);
    },
    now: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    log: () => {},
  });
  assert.equal(attempts, 3);
  assert.equal(elapsed, 20_000);
});

test("timeout fails with the last observed identity and bounds the final wait", async () => {
  let elapsed = 0;
  await assert.rejects(waitForProduction({
    baseURL: "https://example.com",
    expectedSHA,
    timeoutMs: 15_000,
    fetchImpl: async () => buildResponse(oldSHA),
    now: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    log: () => {},
  }), /within 15s\. Serving b/);
  assert.equal(elapsed, 15_000);
});

test("missing or abbreviated expected SHA fails before any request", async () => {
  for (const sha of [undefined, "local", "36e7026"]) {
    await assert.rejects(waitForProduction({ expectedSHA: sha }), /full expected commit SHA/);
  }
});
