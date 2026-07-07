import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/subscription/portal
// Opens Stripe's hosted billing portal so a subscribed pilot can update
// payment methods or cancel — no custom cancellation UI needed.
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
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 });
    }

    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: contractor.stripe_customer_id,
      return_url: `${siteUrl}/pilot`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("pilot subscription portal error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
