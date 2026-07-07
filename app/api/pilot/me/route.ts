import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// GET /api/pilot/me
// Returns the authenticated pilot's profile, active assignments, and payout history.
// Requires the pilot's Supabase auth token in the Authorization header.

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the session
    const supabase = getSupabaseAnonServer(authHeader);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Use service role to read contractor data (RLS blocks anon reads)
    const admin = getSupabaseAdmin();

    // Match by user_id — the real link set at signup/first-login — not
    // email, which can drift and isn't guaranteed unique the way user_id is.
    const { data: contractor } = await admin
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!contractor) {
      return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
    }

    // Get assignments with job details
    const { data: assignments } = await admin
      .from("mission_assignments")
      .select(`
        id, status, mission_price_cents, contractor_payout_cents, dom_commission_cents,
        offered_at, accepted_at, submitted_at,
        job:jobs ( id, title, service_type, location, scheduled_for, status )
      `)
      .eq("contractor_id", contractor.id)
      .order("created_at", { ascending: false });

    // Get payout history
    const { data: payouts } = await admin
      .from("payments")
      .select("id, amount_total_cents, contractor_amount_cents, status, created_at")
      .eq("contractor_id", contractor.id)
      .order("created_at", { ascending: false });

    // Get SOPs the pilot needs to know
    const { data: sops } = await admin
      .from("sop_documents")
      .select("id, slug, title, mission_type, category, version")
      .eq("is_current", true)
      .order("mission_type, category");

    // Clients can name this pilot specifically from their public profile
    // page (see /api/mission-request's requestedContractorId). These stay
    // in the normal admin review/quote pipeline — this is just an
    // informational read so the pilot can see interest coming their way.
    const { data: requestsForMe } = await admin
      .from("mission_requests")
      .select("id, requester_name, company, service_type, location, status, created_at")
      .eq("requested_contractor_id", contractor.id)
      .order("created_at", { ascending: false });

    const { data: portfolio } = await admin
      .from("contractor_portfolio_images")
      .select("id, image_url, caption, sort_order")
      .eq("contractor_id", contractor.id)
      .order("sort_order");

    return NextResponse.json({
      profile: {
        id: contractor.id,
        full_name: contractor.full_name,
        email: contractor.email,
        phone: contractor.phone,
        status: contractor.status,
        part107_number: contractor.part107_number,
        part107_verified: contractor.part107_verified,
        insurance_verified: contractor.insurance_verified,
        stripe_payouts_enabled: contractor.stripe_payouts_enabled,
        service_area: contractor.service_area,
        equipment: contractor.equipment,
        missions_completed: contractor.missions_completed,
        rating: contractor.rating,
        can_create_missions: contractor.can_create_missions,
        subscription_active: contractor.subscription_active,
        slug: contractor.slug,
        bio: contractor.bio,
        tagline: contractor.tagline,
        photo_url: contractor.photo_url,
        website_url: contractor.website_url,
        profile_published: contractor.profile_published,
      },
      assignments: assignments ?? [],
      payouts: payouts ?? [],
      sops: sops ?? [],
      requestsForMe: requestsForMe ?? [],
      portfolio: portfolio ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
