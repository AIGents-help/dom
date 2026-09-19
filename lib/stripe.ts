import Stripe from "stripe";

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia", typescript: true });
  }
  return stripeClient;
}

export const DOM_COMMISSION_BPS = Number(process.env.DOM_COMMISSION_BPS ?? 2000);
export function commissionCents(missionPriceCents: number): number {
  return Math.round((missionPriceCents * DOM_COMMISSION_BPS) / 10000);
}

const SUBSCRIPTION_LOOKUP_KEY = "dom_pilot_subscription_monthly";
export async function getOrCreateSubscriptionPrice(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [SUBSCRIPTION_LOOKUP_KEY], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({ name: "DOM Pilot Subscription — Commission Waiver" });
  return (await stripe.prices.create({ product: product.id, unit_amount: Number(process.env.DOM_SUBSCRIPTION_CENTS ?? 9900), currency: "usd", recurring: { interval: "month" }, lookup_key: SUBSCRIPTION_LOOKUP_KEY })).id;
}

const RESOURCE_ACCESS_LOOKUP_KEY = "dom_resource_access_monthly";
export async function getOrCreateResourceAccessPrice(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [RESOURCE_ACCESS_LOOKUP_KEY], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({ name: "DOM Resource Access — Study Plan" });
  return (await stripe.prices.create({ product: product.id, unit_amount: Number(process.env.DOM_RESOURCE_ACCESS_CENTS ?? 1500), currency: "usd", recurring: { interval: "month" }, lookup_key: RESOURCE_ACCESS_LOOKUP_KEY })).id;
}
