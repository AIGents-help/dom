import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/connect/onboard  { contractorId: string }
// Creates (or resumes) a Stripe Express account for a contractor and returns
// a hosted onboarding link. This previously duplicated checkout/route.ts by
// mistake — it never actually created a Connect account.
export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const { contractorId } = await req.json();

    if (!contractorId) {
      return NextResponse.json({ error: "contractorId required" }, { status: 400 });
    }

    const { data: contractor, error } = await supabaseAdmin
      .from("contractors")
      .select("id, email, stripe_connect_account_id")
      .eq("id", contractorId)
      .single();

    if (error || !contractor) {
      return NextResponse.json({ error: "contractor not found" }, { status: 404 });
    }

    let accountId = contractor.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: contractor.email ?? undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      await supabaseAdmin
        .from("contractors")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", contractorId);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/api/connect/refresh?contractorId=${contractorId}`,
      return_url: `${siteUrl}/contractor/dashboard?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e: any) {
    console.error("connect/onboard error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
