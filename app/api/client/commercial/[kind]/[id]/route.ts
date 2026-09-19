import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const header = req.headers.get("authorization");
  if (!header) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const auth = getSupabaseAnonServer(header);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const { kind, id } = await params;
  const body = await req.json().catch(() => null) as { decision?: string; notes?: string } | null;
  if (!body?.decision || !["quote", "change-order"].includes(kind)) {
    return NextResponse.json({ error: "Invalid commercial decision" }, { status: 400 });
  }
  const rpc = kind === "quote" ? "client_respond_quote_service" : "client_respond_change_order_service";
  const idKey = kind === "quote" ? "p_quote_id" : "p_change_order_id";
  const { error } = await getSupabaseAdmin().rpc(rpc, {
    [idKey]: id,
    p_actor_user_id: user.id,
    p_decision: body.decision,
    p_notes: typeof body.notes === "string" ? body.notes : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: /not found/i.test(error.message) ? 404 : 409 });
  return NextResponse.json({ ok: true, status: body.decision });
}
