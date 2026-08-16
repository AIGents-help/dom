import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = getSupabaseAnonServer(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const status = body.status === "approved" ? "approved" : body.status === "revision_requested" ? "revision_requested" : null;
  const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 4000) : "";
  if (!status) return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
  if (status === "revision_requested" && !feedback) return NextResponse.json({ error: "Please explain the requested revision." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("clients").select("id").eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client profile not found" }, { status: 404 });

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id, name, qc_passed, job:jobs!inner(id, client_id, mission_request_id)")
    .eq("id", id)
    .maybeSingle();
  const job = Array.isArray(deliverable?.job) ? deliverable.job[0] : deliverable?.job;
  if (!deliverable || !job || job.client_id !== client.id) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  if (!deliverable.qc_passed) return NextResponse.json({ error: "This deliverable is still in DOM quality review." }, { status: 409 });

  const reviewedAt = new Date().toISOString();
  const { error } = await admin.from("deliverables").update({ client_status: status, client_feedback: feedback || null, client_reviewed_at: reviewedAt }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (job.mission_request_id) {
    await admin.from("mission_activity_events").insert({
      mission_request_id: job.mission_request_id,
      job_id: job.id,
      event_type: status === "approved" ? "deliverable_approved" : "deliverable_revision_requested",
      summary: status === "approved" ? `Client approved ${deliverable.name}.` : `Client requested a revision to ${deliverable.name}.`,
      visibility: "shared",
      metadata: feedback ? { feedback } : {},
    });
  }

  return NextResponse.json({ ok: true, status, feedback: feedback || null, reviewedAt });
}
