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

// Pilot subscription that waives DOM's commission on self-sourced missions.
// Looked up by a stable lookup_key so the Price/Product self-provisions on
// first use — no manual Stripe dashboard step required.
const SUBSCRIPTION_LOOKUP_KEY = "dom_pilot_subscription_monthly";

export async function getOrCreateSubscriptionPrice(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [SUBSCRIPTION_LOOKUP_KEY], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({ name: "DOM Pilot Subscription — Commission Waiver" });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Number(process.env.DOM_SUBSCRIPTION_CENTS ?? 9900),
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: SUBSCRIPTION_LOOKUP_KEY,
  });
  return price.id;
}
