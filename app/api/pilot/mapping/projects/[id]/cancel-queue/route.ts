import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// POST /api/pilot/mapping/projects/[id]/cancel-queue
// Only cancels a processing job that has not been claimed by a worker yet.
// Once claimed/processing, cancellation must be coordinated with the worker/NodeODM.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, contractor_id, status, image_count")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.status !== "queued") {
    return NextResponse.json({ error: "Only an unclaimed queued project can return to uploads." }, { status: 409 });
  }

  const { data: job } = await admin
    .from("mapping_processing_jobs")
    .select("id, status, worker_id, claimed_at, started_at")
    .eq("mapping_project_id", project.id)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "No queued processing job was found." }, { status: 409 });
  if (job.worker_id || job.claimed_at || job.started_at || job.status !== "queued") {
    return NextResponse.json({ error: "A worker has already claimed this job; it can no longer return directly to uploads." }, { status: 409 });
  }

  const cancelledAt = new Date().toISOString();
  const { error: cancelError } = await admin
    .from("mapping_processing_jobs")
    .update({
      status: "cancelled",
      error_message: "Cancelled by pilot before worker claim.",
      completed_at: cancelledAt,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .is("worker_id", null)
    .is("claimed_at", null);

  if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 });

  const nextProjectStatus = project.image_count > 0 ? "uploaded" : "draft";
  const { error: projectError } = await admin
    .from("mapping_projects")
    .update({
      status: nextProjectStatus,
      processing_progress: 0,
      processing_stage: null,
      error_message: null,
    })
    .eq("id", project.id)
    .eq("status", "queued");

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "queue_cancelled",
    message: "Pilot cancelled an unclaimed processing job and returned the project to imagery upload.",
    metadata: { processing_job_id: job.id, cancelled_at: cancelledAt },
  });

  return NextResponse.json({ ok: true, project_status: nextProjectStatus });
}
