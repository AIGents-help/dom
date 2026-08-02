import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Real outbound Smartlead enrollment. This intentionally does nothing but
// report "pending configuration" until a real Smartlead API credential is
// wired in — we never want the UI to claim a lead was sent to Smartlead when
// it wasn't. The inbound webhook (app/api/webhooks/smartlead/route.ts) is
// unrelated and untouched by this route.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const apiKey = process.env.SMARTLEAD_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Smartlead outbound integration is not configured yet. Set SMARTLEAD_API_KEY to enable enrollment.",
    });
  }

  // No real Smartlead outbound client exists in this codebase yet. Rather than
  // guess at Smartlead's API shape and fabricate a response, refuse to pretend
  // enrollment happened. Wire in a real client here before removing this guard.
  const supabaseAdmin = getSupabaseAdmin();
  const { data: lead, error } = await supabaseAdmin.from("leads").select("id, email").eq("id", id).maybeSingle();
  if (error || !lead) {
    return NextResponse.json({ ok: false, configured: true, message: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: false,
    configured: true,
    message: "SMARTLEAD_API_KEY is set, but no outbound Smartlead client is implemented yet. Nothing was sent.",
  }, { status: 501 });
}
