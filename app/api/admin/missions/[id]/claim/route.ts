import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action !== "release") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("mission_requests")
    .update({ status: "approved", claimed_by_contractor_id: null })
    .eq("id", id).eq("status", "claimed").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Mission claim could not be released" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This mission is no longer claimed" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
