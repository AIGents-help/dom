import { NextRequest, NextResponse } from "next/server";
import { getStripe, getOrCreateSubscriptionPrice } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/subscription/checkout
// Starts a Stripe Checkout session for the $99/mo commission-waiver
// subscription. The contractor is resolved from the pilot's own bearer
// token (not a client-supplied id) so a pilot can only subscribe themselves.
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

    const priceId = await getOrCreateSubscriptionPrice();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { contractor_id: contractor.id },
      success_url: `${siteUrl}/pilot?subscription=complete`,
      cancel_url: `${siteUrl}/pilot?subscription=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("pilot subscription checkout error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
