import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const admin = getSupabaseAdmin();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const { findingId } = await params;
  let body: { note?: unknown; included?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!body || typeof body.note !== "string" || body.note.length > 2000 || typeof body.included !== "boolean") {
    return NextResponse.json({ error: "A note of at most 2000 characters and an inclusion choice are required." }, { status: 400 });
  }
  const { data: finding, error: readError } = await admin.from("dominic_findings")
    .select("id,detector,updated_at").eq("id", findingId).eq("user_id", data.user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Finding could not be loaded." }, { status: 500 });
  if (!finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  // Preserve detector provenance and reject a concurrent update rather than overwriting it.
  const detector = finding.detector && typeof finding.detector === "object" ? finding.detector : {};
  const { data: saved, error: saveError } = await admin.from("dominic_findings").update({ detector: {
    ...detector, reportNote: body.note.trim(), reportIncluded: body.included,
  } }).eq("id", findingId).eq("user_id", data.user.id).eq("updated_at", finding.updated_at).select("id").maybeSingle();
  if (saveError) return NextResponse.json({ error: "Report note could not be saved." }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "This finding changed. Reload it and save again." }, { status: 409 });
  return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
}
