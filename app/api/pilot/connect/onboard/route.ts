import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/connect/onboard
// Self-service Connect onboarding — the contractor is resolved from the
// pilot's own bearer token (not a client-supplied id), same pattern as
// /api/pilot/subscription/checkout, so a pilot can only ever onboard
// themselves. Mirrors /api/connect/onboard's account creation logic (the
// admin-triggered equivalent) but scoped to the calling pilot.
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
      .select("id, email, stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor) {
      return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
    }

    const stripe = getStripe();
    let accountId = contractor.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: contractor.email ?? undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      await admin.from("contractors").update({ stripe_connect_account_id: accountId }).eq("id", contractor.id);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/api/connect/refresh?contractorId=${contractor.id}`,
      return_url: `${siteUrl}/pilot?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e: any) {
    console.error("pilot connect/onboard error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
