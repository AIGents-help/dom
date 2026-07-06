import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/login  { email, password }
// Authenticates via Supabase Auth, then verifies the account is linked to a
// contractors row (not admin_users). Returns session tokens for the browser
// client to hydrate via setSession().

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const supabase = getSupabaseAnonServer();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      // Supabase distinguishes "wrong password" from "correct password, but
      // this account hasn't confirmed its email yet" (code
      // email_not_confirmed) — collapsing both into "Invalid credentials"
      // left a freshly-signed-up pilot with no way to know why login was
      // failing right after a real signup.
      if (error?.code === "email_not_confirmed") {
        return NextResponse.json(
          { error: "Please confirm your email first — check your inbox for a confirmation link from Supabase." },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const adminClient = getSupabaseAdmin();

    // Match by user_id (the real link) first; fall back to email for a
    // contractor row created before this account existed, and claim it —
    // same claim-on-first-login pattern used by /api/contractors/apply.
    let { data: contractor } = await adminClient
      .from("contractors")
      .select("id, full_name, status, user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!contractor) {
      const { data: byEmail } = await adminClient
        .from("contractors")
        .select("id, full_name, status, user_id")
        .eq("email", data.user.email)
        .maybeSingle();

      if (byEmail && !byEmail.user_id) {
        await adminClient
          .from("contractors")
          .update({ user_id: data.user.id })
          .eq("id", byEmail.id)
          .is("user_id", null);
        contractor = { ...byEmail, user_id: data.user.id };
      }
    }

    if (!contractor) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "No pilot account found for this email. Apply at /fly-for-dom first." }, { status: 403 });
    }

    if (contractor.status === "suspended") {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Your pilot account is suspended. Contact DOM ops." }, { status: 403 });
    }

    return NextResponse.json({
      session: data.session,
      contractor: { id: contractor.id, name: contractor.full_name, status: contractor.status },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
