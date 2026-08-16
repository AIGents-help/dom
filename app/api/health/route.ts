import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("mission_requests").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "healthy", database: "reachable", latencyMs: Date.now() - started, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
