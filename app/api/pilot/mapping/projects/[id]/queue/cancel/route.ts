import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, status, image_count")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.status !== "queued") {
    return NextResponse.json({ error: "Only a queued project can be reopened before a worker claims it." }, { status: 409 });
  }

  const { data: queuedJob } = await admin
    .from("mapping_processing_jobs")
    .select("id, status, worker_id")
    .eq("mapping_project_id", project.id)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!queuedJob) {
    return NextResponse.json({ error: "No queued processing job was found." }, { status: 409 });
  }
  if (queuedJob.worker_id) {
    return NextResponse.json({ error: "The processing worker has already claimed this job, so it can no longer be reopened safely." }, { status: 409 });
  }

  const cancelledAt = new Date().toISOString();
  const { error: cancelError } = await admin
    .from("mapping_processing_jobs")
    .update({
      status: "cancelled",
      completed_at: cancelledAt,
      error_message: "Cancelled by pilot before worker claim.",
    })
    .eq("id", queuedJob.id)
    .eq("status", "queued");

  if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 });

  const nextStatus = project.image_count >= 2 ? "uploaded" : project.image_count > 0 ? "uploading" : "draft";
  const { error: projectError } = await admin
    .from("mapping_projects")
    .update({
      status: nextStatus,
      processing_progress: 0,
      processing_stage: null,
      error_message: null,
    })
    .eq("id", project.id);

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "queue_cancelled",
    message: "Pilot cancelled queued processing before worker claim and reopened imagery uploads.",
    metadata: { processing_job_id: queuedJob.id, cancelled_at: cancelledAt },
  });

  return NextResponse.json({ ok: true, projectStatus: nextStatus });
}
