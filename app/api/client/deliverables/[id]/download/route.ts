import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getSupabaseAnonServer(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("clients").select("id").eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client profile not found" }, { status: 404 });
  const { id } = await params;
  const { data: deliverable } = await admin.from("deliverables").select("storage_url, qc_passed, job:jobs!inner(client_id)").eq("id", id).maybeSingle();
  const job = Array.isArray(deliverable?.job) ? deliverable.job[0] : deliverable?.job;
  if (!deliverable || !job || job.client_id !== client.id || !deliverable.qc_passed || !deliverable.storage_url) return NextResponse.json({ error: "File not available" }, { status: 404 });
  const { data, error } = await admin.storage.from("mission-deliverables").createSignedUrl(deliverable.storage_url, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "File could not be opened" }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
