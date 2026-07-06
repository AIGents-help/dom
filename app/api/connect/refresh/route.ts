import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/connect/refresh?contractorId=...
// Stripe navigates the browser here when an onboarding link expires mid-flow.
// Regenerate a fresh account link and redirect. This previously duplicated
// checkout/route.ts by mistake — it never actually touched Stripe Connect.
export async function GET(req: NextRequest) {
  const contractorId = req.nextUrl.searchParams.get("contractorId");
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId required" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: contractor, error } = await supabaseAdmin
      .from("contractors")
      .select("stripe_connect_account_id")
      .eq("id", contractorId)
      .single();

    if (error || !contractor?.stripe_connect_account_id) {
      return NextResponse.json({ error: "contractor has no Stripe account" }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const accountLink = await stripe.accountLinks.create({
      account: contractor.stripe_connect_account_id,
      refresh_url: `${siteUrl}/api/connect/refresh?contractorId=${contractorId}`,
      return_url: `${siteUrl}/pilot?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (e: any) {
    console.error("connect/refresh error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
