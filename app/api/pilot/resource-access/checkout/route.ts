import { NextRequest, NextResponse } from "next/server";
import { getStripe, getOrCreateResourceAccessPrice } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/resource-access/checkout
// Starts a Stripe Checkout session for the resource-access study plan —
// the path an unverified pilot takes to keep tutorial/resource access past
// their verification deadline. Mirrors
// /api/pilot/subscription/checkout exactly, except for the price and the
// subscription_type tag, which the webhook uses to tell the two products
// apart (they're deliberately separate Stripe products/columns — see plan).
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const supabaseAuth = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: contractor } = await admin
      .from("contractors")
      .select("id, email, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor) {
      return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
    }

    const stripe = getStripe();
    let customerId = contractor.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: contractor.email ?? undefined,
        metadata: { contractor_id: contractor.id },
      });
      customerId = customer.id;
      await admin.from("contractors").update({ stripe_customer_id: customerId }).eq("id", contractor.id);
    }

    const priceId = await getOrCreateResourceAccessPrice();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // subscription_type lives in both places on purpose — see the
      // matching comment in /api/pilot/subscription/checkout.
      metadata: { contractor_id: contractor.id, subscription_type: "resource_access" },
      subscription_data: { metadata: { contractor_id: contractor.id, subscription_type: "resource_access" } },
      success_url: `${siteUrl}/pilot?resource_access=complete`,
      cancel_url: `${siteUrl}/pilot?resource_access=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("pilot resource-access checkout error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
