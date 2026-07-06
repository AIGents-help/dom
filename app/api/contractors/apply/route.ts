import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/contractors/apply
// Creates a contractor in 'applied' status. Runs server-side (service role) because
// the contractors table is RLS-locked. Returns the new contractor id so the client
// can immediately launch Stripe onboarding.
export async function POST(req: NextRequest) {
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
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ contractorId: data.id });
  } catch (e: any) {
    console.error("contractors/apply error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
