import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const PRODUCTS = {
  "barrier-3": {
    name: "Drone Operation Barrier Kit — 3 Pack",
    unitAmount: 14900,
    description: "Three high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.",
  },
  "barrier-4": {
    name: "Drone Operation Barrier Kit — 4 Pack",
    unitAmount: 19900,
    description: "Four high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit.",
  },
} as const;

type ProductKey = keyof typeof PRODUCTS;

export async function POST(req: NextRequest) {
  try {
    const { productKey, quantity = 1 } = await req.json();
    const product = PRODUCTS[productKey as ProductKey];
    const qty = Number(quantity);

    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }

    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: product.unitAmount,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
        },
      ],
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      metadata: {
        order_type: "dom_shop",
        product_key: productKey,
      },
      success_url: `${siteUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/shop/drone-operation-barriers?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("shop checkout error:", e);
    return NextResponse.json({ error: e.message ?? "Unable to start checkout" }, { status: 500 });
  }
}
