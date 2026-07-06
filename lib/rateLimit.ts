import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter — 30 requests/min per IP. Per-instance only
// (resets on cold start, not shared across serverless instances), which is
// fine for basic abuse deterrence; a distributed store (Upstash/Redis) would
// be needed for accurate limits across multiple instances.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Opportunistically sweep expired buckets so the map doesn't grow unbounded
// on a long-running process (no-op cost on serverless, where instances are short-lived).
function sweepExpired(now: number) {
  if (Math.random() > 0.01) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Returns a 429 response if the caller has exceeded the limit, else null —
// call this first in a route handler and return early if it's non-null.
// Buckets are keyed per-route (not just per-IP) so exhausting one endpoint's
// limit doesn't also block a caller from a different endpoint.
export function rateLimitResponse(req: NextRequest): NextResponse | null {
  const now = Date.now();
  sweepExpired(now);

  const key = `${req.nextUrl.pathname}:${getClientIp(req)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count++;

  if (bucket.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } }
    );
  }

  return null;
}
