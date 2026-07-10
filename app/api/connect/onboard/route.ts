import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";

// POST /api/connect/onboard  { contractorId: string }
// Admin-triggered onboarding — starts/resumes Connect onboarding on behalf
// of any contractor. This had no auth check at all until now: any caller
// could pass an arbitrary contractorId and create/resume a Stripe Connect
// account for a contractor they don't own. Pilots have their own
// self-service equivalent at /api/pilot/connect/onboard.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

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
      return_url: `${siteUrl}/pilot?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e: any) {
    console.error("connect/onboard error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
