import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed tokens for the Google-Drive-backed download proxy
// (app/api/pilot/mapping/projects/[id]/deliverables/[deliverableId]/download/file).
// window.open() (see MappingDeliverables.tsx/MappingResults.tsx) is a plain
// navigation — it can't carry the Authorization: Bearer header the rest of
// the mapper API requires, so this query-string token stands in for it:
// minted server-side by the already-Bearer-authenticated sibling route
// (download/route.ts), then verified here with no further auth needed.
// Reuses SUPABASE_SERVICE_ROLE_KEY as the HMAC key when no dedicated
// secret is set — safe, since HMAC output never reveals the key, and this
// server already trusts that env var with full DB access.
const SECRET = process.env.MAPPER_DOWNLOAD_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEFAULT_TTL_SECONDS = 300;

function sign(deliverableId: string, exp: number): string {
  return createHmac("sha256", SECRET).update(`${deliverableId}.${exp}`).digest("hex");
}

export function signDownloadToken(deliverableId: string, ttlSeconds = DEFAULT_TTL_SECONDS): { exp: number; sig: string } {
  const exp = Date.now() + ttlSeconds * 1000;
  return { exp, sig: sign(deliverableId, exp) };
}

export function verifyDownloadToken(deliverableId: string, exp: number, sig: string): boolean {
  if (!SECRET || !sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(sign(deliverableId, exp), "hex");
  const actual = Buffer.from(sig, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
