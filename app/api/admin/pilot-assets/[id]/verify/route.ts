import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.verified !== "boolean") return NextResponse.json({ error: "verified must be a boolean" }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("pilot_assets")
    .update({ capabilities_verified: body.verified, capabilities_verified_at: body.verified ? new Date().toISOString() : null })
    .eq("id", id).select("id, capabilities_verified").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  return NextResponse.json({ asset: data });
}
