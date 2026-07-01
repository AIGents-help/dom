import Stripe from "stripe";

// Server-side Stripe client. STRIPE_SECRET_KEY is set in your env — never in code.
// Use your TEST key (sk_test_...) while building; swap to live only when you go live.
// Lazily constructed so builds don't crash when STRIPE_SECRET_KEY isn't set (e.g. Vercel preview builds).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// Your default platform commission (basis points). 2000 = 20%.
export const DOM_COMMISSION_BPS = Number(process.env.DOM_COMMISSION_BPS ?? 2000);

export function commissionCents(missionPriceCents: number): number {
  return Math.round((missionPriceCents * DOM_COMMISSION_BPS) / 10000);
}
