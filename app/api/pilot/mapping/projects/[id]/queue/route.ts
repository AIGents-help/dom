import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { canQueueProcessing } from "@/lib/mapperPipeline";

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

  const guard = canQueueProcessing(project);
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const { error: jobError } = await admin.from("mapping_processing_jobs").insert({
    mapping_project_id: project.id,
    status: "queued",
    processor: "nodeodm",
  });
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  await admin
    .from("mapping_projects")
    .update({ status: "queued", error_message: null })
    .eq("id", project.id);

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "queued",
    message: `Queued for processing (${project.image_count} images).`,
  });

  return NextResponse.json({ ok: true });
}
