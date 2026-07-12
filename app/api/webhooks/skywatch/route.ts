import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

// POST /api/webhooks/skywatch
// SkyWatch insurance stub — full integration deferred to a future
// partnership conversation, so there's no real event schema or signing
// scheme to implement against yet. This only verifies a shared-secret
// header and logs the payload; no business logic (e.g. flipping
// insurance_verified) is wired until a real spec exists.
export async function POST(req: NextRequest) {
  const secret = process.env.SKYWATCH_WEBHOOK_SECRET;
  const provided = req.headers.get("x-skywatch-signature");

  if (!secret || !provided) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  // Hash both sides to a fixed-length digest before comparing — a direct
  // timingSafeEqual(providedBuffer, secretBuffer) throws RangeError whenever
  // the two differ in length, which they almost always will, turning "401
  // on a bad caller" into "500 on nearly everything."
  const providedDigest = createHash("sha256").update(provided).digest();
  const secretDigest = createHash("sha256").update(secret).digest();

  if (!timingSafeEqual(providedDigest, secretDigest)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = await req.text();
  console.log("[SkyWatch webhook stub] received payload (unimplemented):", body);

  return NextResponse.json({ received: true });
}
