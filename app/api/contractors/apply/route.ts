import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimitResponse } from "@/lib/rateLimit";
import { computeMembershipDeadline, type CertTimelineBucket } from "@/lib/certTimeline";
import { sendNotification } from "@/lib/resend/client";
import { unverifiedPilotWelcome } from "@/lib/resend/templates";

// POST /api/contractors/apply
// Creates a contractor in 'applied' status. Runs server-side (service role) because
// the contractors table is RLS-locked. Returns the new contractor id so the client
// can immediately launch Stripe onboarding.
export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const b = await req.json();

    if (!b.full_name || !b.email) {
      return NextResponse.json({ error: "name and email required" }, { status: 400 });
    }

    // Reuse an existing record if this email already applied. If it isn't
    // linked to an auth account yet and this call brings one, claim it —
    // covers a contractor who applied before self-serve signup existed.
    const { data: existing } = await supabaseAdmin
      .from("contractors")
      .select("id, user_id")
      .eq("email", b.email)
      .maybeSingle();

    if (existing) {
      if (!existing.user_id && b.authUserId) {
        await supabaseAdmin
          .from("contractors")
          .update({ user_id: b.authUserId })
          .eq("id", existing.id)
          .is("user_id", null);
      }
      return NextResponse.json({ contractorId: existing.id, existing: true });
    }

    const bucket = b.cert_timeline_bucket as CertTimelineBucket | undefined;
    const testDate = b.part107_test_date ? new Date(b.part107_test_date) : null;
    const signupDate = new Date();
    const membershipDeadline = bucket ? computeMembershipDeadline(bucket, signupDate, testDate) : null;

    const { data, error } = await supabaseAdmin
      .from("contractors")
      .insert({
        full_name: b.full_name,
        email: b.email,
        phone: b.phone ?? null,
        part107_number: b.part107_number ?? null,
        service_area: b.service_area ?? null,
        equipment: b.equipment ?? null,
        status: "applied",
        user_id: b.authUserId ?? null,
        cert_timeline_bucket: bucket ?? null,
        part107_test_date: b.part107_test_date ?? null,
        membership_deadline: membershipDeadline,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Only unverified-tier signups (no Part 107 # yet) get the deadline
    // welcome email — someone applying with a cert number already isn't on
    // this clock at all.
    if (membershipDeadline && !b.part107_number) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.droneopsman.com";
      const { subject, html } = unverifiedPilotWelcome({
        pilotName: b.full_name,
        deadlineDate: membershipDeadline,
        resourcesLink: `${siteUrl}/pilot/login`,
      });
      await sendNotification({
        to: b.email,
        emailType: "unverified_pilot_welcome",
        recipientType: "pilot",
        recipientEntityId: data.id,
        subject,
        html,
      }).catch((e) => console.error("unverified_pilot_welcome send failed:", e));
    }

    return NextResponse.json({ contractorId: data.id });
  } catch (e: any) {
    console.error("contractors/apply error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
