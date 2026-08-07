import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// GET /api/pilot/mapping/projects/[id] — full project workspace payload:
// the project itself, its images, its processing job history, its recent
// events, and any completed deliverables already registered for its job.
// Every query below is scoped by contractor_id = the resolved contractor —
// the URL's [id] alone is never trusted as sufficient authorization.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("*, job:jobs(id, title, location, status)")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const [{ data: images }, { data: processingJobs }, { data: events }, { data: deliverables }] = await Promise.all([
    admin.from("mapping_images").select("*").eq("mapping_project_id", id).order("created_at"),
    admin.from("mapping_processing_jobs").select("*").eq("mapping_project_id", id).order("created_at", { ascending: false }),
    admin.from("mapping_events").select("*").eq("mapping_project_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("deliverables").select("id, name, type, storage_url, qc_passed, delivered_at, created_at").eq("job_id", project.job_id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    project,
    images: images ?? [],
    processingJobs: processingJobs ?? [],
    events: events ?? [],
    deliverables: deliverables ?? [],
  });
}
