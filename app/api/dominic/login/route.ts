import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required." }, { status: 400 });
    }

    const supabase = getSupabaseAnonServer();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      if (error?.code === "email_not_confirmed") {
        return NextResponse.json({ error: "Please confirm your email first." }, { status: 401 });
      }
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from("dominic_profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!existing) {
      const { data: contractor } = await admin
        .from("contractors")
        .select("full_name")
        .eq("user_id", data.user.id)
        .maybeSingle();

      const { error: profileError } = await admin
        .from("dominic_profiles")
        .insert({
          user_id: data.user.id,
          full_name: contractor?.full_name ?? data.user.user_metadata?.full_name ?? null,
          company: null,
          plan: "free",
          status: "active",
        });

      if (profileError) {
        console.error("DOMINIC first-login profile error:", profileError);
      }
    }

    return NextResponse.json({ session: data.session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unable to sign in." }, { status: 500 });
  }
}
