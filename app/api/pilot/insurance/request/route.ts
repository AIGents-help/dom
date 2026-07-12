import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// POST /api/pilot/insurance/request
// SkyWatch insurance stub (scaffolding only — full integration deferred to a
// future partnership conversation). Records that a pilot has started the
// process so admin can follow up manually; insurance_verified (the real gate
// on checkout/queue access) stays a separate, admin-only manual toggle.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseAnonServer(authHeader);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: contractor } = await admin
      .from("contractors")
      .select("id, insurance_verified")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor) {
      return NextResponse.json({ error: "No pilot profile found" }, { status: 404 });
    }
    if (contractor.insurance_verified) {
      return NextResponse.json({ error: "Insurance already verified" }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from("contractors")
      .update({ insurance_requested: true })
      .eq("id", contractor.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
