import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { getDeliverableDownloadUrl } from "@/lib/mapperStorage";

// GET /api/pilot/mapping/projects/[id]/deliverables/[deliverableId]/download
// Mints a short-lived download URL server-side. The pilot is authorized
// against the mapping project (contractor_id = the resolved contractor,
// same as GET .../projects/[id]), then the deliverable is required to
// belong to that project's job -- the deliverable id alone is never
// trusted as sufficient authorization. Never returns the service-role
// key or raw provider errors to the browser; those are logged here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, deliverableId } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, job_id")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id, storage_url, storage_provider, external_file_id")
    .eq("id", deliverableId)
    .eq("job_id", project.job_id)
    .maybeSingle();
  if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });

  const result = await getDeliverableDownloadUrl(deliverable);
  if (!result.ok) {
    console.error(`[pilot/mapping/deliverables/download] deliverable ${deliverableId}: ${result.log}`);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
