import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const admin = getSupabaseAdmin();
  const { data: authData } = await admin.auth.getUser(token);
  if (!authData.user) return NextResponse.json({ error: "Admin session expired" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim().slice(0, 200) : "";
  const reference = typeof body?.reference === "string" ? body.reference.trim().slice(0, 200) : "";
  const expiresOn = typeof body?.expiresOn === "string" ? body.expiresOn : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!provider || !reference || reason.length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    return NextResponse.json({ error: "Covering organization, reference, future expiration date, and a clear reason are required." }, { status: 400 });
  }
  if (new Date(`${expiresOn}T23:59:59Z`).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Coverage expiration must be in the future." }, { status: 400 });
  }

  const { error } = await admin.rpc("admin_approve_alternate_insurance", {
    p_contractor_id: id,
    p_actor_user_id: authData.user.id,
    p_provider: provider,
    p_reference: reference,
    p_expires_on: expiresOn,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
