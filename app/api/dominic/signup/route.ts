import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function POST(req: NextRequest) {
  try {
    const { fullName, company, email, password } = await req.json();
    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      return NextResponse.json({ error: "Name, email, and a password of at least 8 characters are required." }, { status: 400 });
    }

    const supabase = getSupabaseAnonServer();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          dominic_account: true,
        },
      },
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Unable to create DOMINIC account." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error: profileError } = await admin
      .from("dominic_profiles")
      .upsert(
        {
          user_id: data.user.id,
          full_name: fullName.trim(),
          company: company?.trim() || null,
          plan: "free",
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      console.error("DOMINIC profile create error:", profileError);
      return NextResponse.json({ error: "Account created, but the DOMINIC profile could not be initialized." }, { status: 500 });
    }

    return NextResponse.json({
      session: data.session,
      requiresConfirmation: !data.session,
      profile: { plan: "free" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unable to create DOMINIC account." }, { status: 500 });
  }
}
