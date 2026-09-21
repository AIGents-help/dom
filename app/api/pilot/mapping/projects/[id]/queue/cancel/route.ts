import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// POST /api/pilot/mapping/projects/[id]/queue/cancel
// Safe cancel for jobs that have not been claimed by a worker yet.
// Keeps all uploaded imagery and reopens the project for additional uploads.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, status")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.status !== "queued") {
    return NextResponse.json({ error: `Only an unclaimed queued project can be cancelled. Current status: ${project.status}.` }, { status: 409 });
  }

  const { data: job } = await admin
    .from("mapping_processing_jobs")
    .select("id,status,worker_id,claimed_at,started_at")
    .eq("mapping_project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job || job.status !== "queued" || job.worker_id || job.claimed_at || job.started_at) {
    return NextResponse.json({ error: "This job has already been claimed or started and can no longer be safely cancelled here." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: jobError } = await admin
    .from("mapping_processing_jobs")
    .update({ status: "cancelled", completed_at: now, error_message: "Cancelled by pilot before worker claim." })
    .eq("id", job.id)
    .eq("status", "queued");

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  const { error: projectError } = await admin
    .from("mapping_projects")
    .update({ status: "uploaded", processing_progress: 0, processing_stage: null, error_message: null })
    .eq("id", project.id);

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "processing_queue_cancelled",
    message: "Pilot cancelled queued processing before a worker claimed it; uploads reopened.",
    metadata: { processing_job_id: job.id },
  });

  return NextResponse.json({ ok: true });
}
