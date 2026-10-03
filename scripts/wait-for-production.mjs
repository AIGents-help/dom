import { pathToFileURL } from "node:url";

export async function probeProduction(baseURL, expectedSHA, fetchImpl = fetch) {
  try {
    const url = new URL("/api/build", baseURL);
    url.searchParams.set("expected", expectedSHA);
    const response = await fetchImpl(url, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!response.ok) return { ready: false, reason: `HTTP ${response.status}` };
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return { ready: false, reason: "Build endpoint did not return JSON" };
    }
    const body = await response.json();
    if (body?.buildId !== expectedSHA) {
      return { ready: false, reason: `Serving ${body?.buildId ?? "unknown"}; expected ${expectedSHA}` };
    }
    if (!/\bno-store\b/i.test(response.headers.get("cache-control") ?? "")) {
      return { ready: false, reason: "Build identity response is cacheable" };
    }
    return { ready: true, reason: `Production is serving ${expectedSHA}` };
  } catch (error) {
    return { ready: false, reason: `Build endpoint unavailable: ${error instanceof Error ? error.message : "request failed"}` };
  }
}

export async function waitForProduction({
  baseURL = "https://droneopsman.com",
  expectedSHA,
  timeoutMs = 600_000,
  intervalMs = 10_000,
  fetchImpl = fetch,
  now = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
}) {
  if (!/^[a-f0-9]{40}$/i.test(expectedSHA ?? "")) {
    throw new Error("A full expected commit SHA is required for production verification");
  }
  const deadline = now() + timeoutMs;
  let lastReason = "No response received";
  while (now() < deadline) {
    const result = await probeProduction(baseURL, expectedSHA, fetchImpl);
    lastReason = result.reason;
    log(result.reason);
    if (result.ready) return;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error(`Production did not expose commit ${expectedSHA} within ${timeoutMs / 1000}s. ${lastReason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await waitForProduction({
    baseURL: process.env.E2E_BASE_URL || "https://droneopsman.com",
    expectedSHA: process.env.PRODUCTION_EXPECTED_SHA || process.env.GITHUB_SHA,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
