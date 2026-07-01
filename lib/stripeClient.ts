"use client";
import { loadStripe, Stripe } from "@stripe/stripe-js";

// Publishable key is safe to expose. Used by the client checkout page.
// Lazily constructed so prerendering doesn't crash when env vars aren't set at build time.
let _stripePromise: Promise<Stripe | null> | null = null;
export function getStripePromise(): Promise<Stripe | null> {
  if (!_stripePromise) {
    _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);
  }
  return _stripePromise;
}
