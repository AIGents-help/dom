import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { canQueueProcessing, PROCESSING_PROFILES, normalizeRequestedOutputs, resolveProcessingProfileOptions } from "@/lib/mapperPipeline";

// POST /api/pilot/mapping/projects/[id]/queue
// Inserts a mapping_processing_jobs row (status 'queued') and flips the
// project to 'queued'. The worker (services/mapper-worker) picks this up
// via claim_mapping_processing_job() — this route never talks to NodeODM
// or does any processing itself.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("*")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const revisionRequested = body?.revision === true;
  if (revisionRequested) {
    if (project.status !== "completed") return NextResponse.json({ error: "Revision processing can only start from a completed project." }, { status: 409 });
    const { data: revisions } = await admin.from("deliverables").select("id, type, client_feedback").eq("job_id", project.job_id).eq("client_status", "revision_requested");
    if (!revisions?.length) return NextResponse.json({ error: "No client revision request is open for this project." }, { status: 409 });
  } else {
    const guard = canQueueProcessing(project);
    if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });
  }


  const requestedOutputs = normalizeRequestedOutputs(body?.requested_outputs);
  if (!revisionRequested && requestedOutputs.length === 0) {
    return NextResponse.json({ error: "Choose at least one DOMINIC output before queueing processing." }, { status: 400 });
  }

  const requestedProfile = typeof body?.profile === "string" ? body.profile : "standard";
  const profile = PROCESSING_PROFILES.some((p) => p.value === requestedProfile) ? requestedProfile : "standard";
  const requestedContourInterval = Number(body?.contour_interval_m);
  const contourInterval = Number.isFinite(requestedContourInterval) && requestedContourInterval > 0
    ? Math.min(20, Math.max(0.1, requestedContourInterval))
    : 0.5;
  const options = [
    ...resolveProcessingProfileOptions(profile, requestedOutputs),
    { name: "__dom_contour_interval_m", value: contourInterval },
    { name: "__dom_requested_outputs", value: requestedOutputs },
  ];

  const { error: jobError } = await admin.from("mapping_processing_jobs").insert({
    mapping_project_id: project.id,
    status: "queued",
    processor: "nodeodm",
    profile,
    options,
  });
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  await admin
    .from("mapping_projects")
    .update({ status: "queued", error_message: null })
    .eq("id", project.id);

  if (revisionRequested) {
    const { data: openRevisions } = await admin.from("deliverables")
      .select("id, type, client_feedback")
      .eq("job_id", project.job_id)
      .eq("client_status", "revision_requested");
    await admin.from("mapping_events").insert({
      mapping_project_id: project.id,
      actor_type: "pilot",
      actor_id: auth.contractor.id,
      event_type: "revision_scope",
      message: `Corrected processing requested for ${openRevisions?.length ?? 0} client revision item(s).`,
      metadata: { deliverables: openRevisions ?? [] },
    });
  }

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: revisionRequested ? "revision_queued" : "queued",
    message: revisionRequested ? `Queued corrected output processing (${project.image_count} images).` : `Queued for processing (${project.image_count} images).`,
    metadata: revisionRequested
      ? { reason: "client_revision_requested", requested_outputs: requestedOutputs }
      : { requested_outputs: requestedOutputs, profile },
  });

  return NextResponse.json({ ok: true });
}
