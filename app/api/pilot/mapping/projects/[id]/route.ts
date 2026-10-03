import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import type { ProjectRecords } from "@/lib/dominicProjectRecords";

// GET /api/pilot/mapping/projects/[id] — full project workspace payload:
// the project itself, its images, its processing job history, its recent
// events, and any completed deliverables already registered for its job.
// Every query below is scoped by contractor_id = the resolved contractor —
// the URL's [id] alone is never trusted as sufficient authorization.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
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
    admin
      .from("deliverables")
      .select("id, name, type, storage_url, storage_provider, external_file_id, potree, qc_passed, client_status, client_feedback, client_reviewed_at, supersedes_deliverable_id, revision_number, delivered_at, created_at")
      .eq("job_id", project.job_id)
      .order("created_at", { ascending: false }),
  ]);

  const records: ProjectRecords = { capturePlans: [], inspections: [], findings: [], recordsError: null };
  // Plan metadata supplies the relationship, never permission. Scope each
  // inspection and finding to the verified account even when links are forged.
  const plans = await admin.from("dominic_capture_plans")
    .select("id,name,mission_type,updated_at")
    .eq("user_id", auth.contractor.user_id)
    .eq("plan_state->>mappingProjectId", id)
    .order("updated_at", { ascending: false });
  if (plans.error) records.recordsError = "Linked capture plans could not be loaded.";
  else records.capturePlans = plans.data ?? [];

  {
    const linkedPlanIds = records.capturePlans.map((plan) => plan.id);
    const inspectionFilter = linkedPlanIds.length
      ? `mapping_project_id.eq.${id},capture_plan_id.in.(${linkedPlanIds.join(",")})`
      : `mapping_project_id.eq.${id}`;
    const inspections = await admin.from("dominic_inspections")
      .select("id,asset_id,capture_plan_id,inspection_type,objective,status,summary")
      .eq("user_id", auth.contractor.user_id)
      .or(inspectionFilter)
      .order("created_at", { ascending: false });
    if (inspections.error) records.recordsError = "Linked inspections could not be loaded.";
    else if (inspections.data?.length) {
      const [assets, findings] = await Promise.all([
        admin.from("dominic_assets").select("id,name")
          .eq("user_id", auth.contractor.user_id)
          .in("id", [...new Set(inspections.data.map((inspection) => inspection.asset_id))]),
        admin.from("dominic_findings").select("id,inspection_id,title,severity,review_status")
          .eq("user_id", auth.contractor.user_id)
          .in("inspection_id", inspections.data.map((inspection) => inspection.id))
          .order("observed_at", { ascending: false }),
      ]);
      if (assets.error || findings.error) records.recordsError = "Some inspection evidence could not be loaded.";
      const names = new Map((assets.data ?? []).map((asset) => [asset.id, asset.name]));
      records.inspections = inspections.data.map((inspection) => ({ ...inspection, asset_name: names.get(inspection.asset_id) ?? "Asset unavailable" }));
      records.findings = findings.data ?? [];
    }
  }

  return NextResponse.json({
    project,
    images: images ?? [],
    processingJobs: processingJobs ?? [],
    events: events ?? [],
    deliverables: deliverables ?? [],
    ...records,
  });
}
