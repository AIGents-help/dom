import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const existingClientId = typeof body.existingClientId === "string" && body.existingClientId
    ? body.existingClientId
    : null;
  if (existingClientId && !UUID.test(existingClientId)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: authData } = await admin.auth.getUser(token);
  const actor = authData.user?.email ?? null;

  const { data: clientId, error } = await admin.rpc("admin_convert_lead_to_client_service", {
    p_lead_id: id,
    p_existing_client_id: existingClientId,
    p_actor: actor,
  });

  if (error) {
    const conflict = /already|exists|linked/i.test(error.message);
    const missing = /not found/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: missing ? 404 : conflict ? 409 : 400 },
    );
  }

  return NextResponse.json({ ok: true, clientId });
}
