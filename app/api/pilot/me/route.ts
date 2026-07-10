import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { fuzzyGrid } from "@/lib/fuzzyLocation";

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

    // The pilot's current commission rate, for display only. Passing 0 as
    // the mission value deliberately evaluates the $500+ risk floor to 0,
    // so this returns just the pilot-tier rate (or 0 if subscribed) —
    // reuses the one real calculation instead of duplicating the tier
    // bands in TypeScript. A specific mission's actual rate can still be
    // higher once its real value is known (see the $500+ floor note in the
    // dashboard copy).
    const { data: currentCommissionBps } = await admin.rpc("calculate_commission_bps", {
      p_contractor_id: contractor.id,
      p_mission_value_cents: 0,
    });

    // Get assignments with job details
    const { data: assignments } = await admin
      .from("mission_assignments")
      .select(`
        id, status, mission_price_cents, contractor_payout_cents, dom_commission_cents,
        offered_at, accepted_at, submitted_at,
        job:jobs ( id, title, service_type, location, scheduled_for, status, mission_request_id, delivery_responsibility )
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
      .select("id, slug, title, mission_type, category, version, body_md")
      .eq("is_current", true)
      .order("mission_type, category");

    // Training tutorials (Resources tab). Free ones always include body_md;
    // premium ones only include it once subscribed — otherwise the pilot
    // sees the title/category as a locked teaser, not the content itself.
    const { data: tutorialsRaw } = await admin
      .from("pilot_tutorials")
      .select("id, slug, title, category, is_premium, version, body_md")
      .eq("is_current", true)
      .order("category, title");

    // An unverified pilot whose membership_deadline has lapsed into a lock
    // (see /api/cron/check-verification-deadlines) loses ALL tutorial
    // access, not just premium — verified status always overrides this
    // regardless of deadline/lock state.
    const resourcesLocked =
      contractor.resource_access_locked && !contractor.part107_verified && !contractor.resource_access_active;

    const tutorials = (tutorialsRaw ?? []).map((t) => {
      const unlocked = !resourcesLocked && (!t.is_premium || contractor.subscription_active);
      return {
        id: t.id,
        slug: t.slug,
        title: t.title,
        category: t.category,
        is_premium: t.is_premium,
        version: t.version,
        locked: !unlocked,
        body_md: unlocked ? t.body_md : null,
      };
    });

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

    // Missions this pilot claimed from the open queue, awaiting admin
    // review — same redacted field set as /api/pilot/queue (no contact
    // info), so a claim disappearing into review isn't a silent vanish.
    const { data: myClaimsRaw } = await admin
      .from("mission_requests")
      .select("id, service_type, status, created_at, scheduled_date, airspace_class, latitude, longitude")
      .eq("claimed_by_contractor_id", contractor.id)
      .eq("status", "claimed")
      .order("created_at", { ascending: false });

    const claimIds = (myClaimsRaw ?? []).map((m) => m.id);
    const { data: claimQuotes } = claimIds.length
      ? await admin
          .from("quotes")
          .select("mission_request_id, contractor_cents, created_at")
          .in("mission_request_id", claimIds)
          .order("created_at", { ascending: false })
      : { data: [] };
    const claimPayoutByMission = new Map<string, number>();
    for (const q of claimQuotes ?? []) {
      if (!claimPayoutByMission.has(q.mission_request_id)) claimPayoutByMission.set(q.mission_request_id, q.contractor_cents);
    }

    const myClaims = (myClaimsRaw ?? []).map((m) => ({
      id: m.id,
      service_type: m.service_type,
      status: m.status,
      created_at: m.created_at,
      scheduled_date: m.scheduled_date,
      airspace_class: m.airspace_class,
      area: fuzzyGrid(m.latitude, m.longitude),
      payout_cents: claimPayoutByMission.get(m.id) ?? null,
    }));

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
        stripe_connect_account_id: contractor.stripe_connect_account_id,
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
        cert_timeline_bucket: contractor.cert_timeline_bucket,
        membership_deadline: contractor.membership_deadline,
        resource_access_locked: contractor.resource_access_locked,
        resource_access_active: contractor.resource_access_active,
        current_commission_bps: currentCommissionBps ?? null,
      },
      resourcesLocked,
      assignments: assignments ?? [],
      payouts: payouts ?? [],
      sops: sops ?? [],
      tutorials: tutorials ?? [],
      requestsForMe: requestsForMe ?? [],
      portfolio: portfolio ?? [],
      myClaims: myClaims ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
