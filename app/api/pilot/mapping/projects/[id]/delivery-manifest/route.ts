import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { getDeliverableDownloadUrl } from "@/lib/mapperStorage";

export const runtime = "nodejs";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// GET /api/pilot/mapping/projects/[id]/delivery-manifest
// A lightweight branded manifest that travels with the project's approved
// professional files. Source GIS/CAD/raster data stays untouched.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, name, location_snapshot, image_count, processing_completed_at, job_id, job:jobs(title, location)")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: deliverables } = await admin
    .from("deliverables")
    .select("id, name, type, storage_url, storage_provider, external_file_id, qc_passed, client_status, client_feedback, client_reviewed_at, supersedes_deliverable_id, revision_number, delivered_at, created_at")
    .eq("job_id", project.job_id)
    .eq("qc_passed", true)
    .neq("client_status", "superseded")
    .order("created_at");

  const approved = deliverables ?? [];
  const rows = await Promise.all(approved.map(async (item) => {
    const download = await getDeliverableDownloadUrl(item, id);
    return {
      name: `${item.name}${Number(item.revision_number ?? 1) > 1 ? ` · Rev ${item.revision_number}` : ""}`,
      type: titleCase(item.type ?? "output"),
      deliveredAt: item.delivered_at,
      clientStatus: item.client_status ?? null,
      clientFeedback: item.client_feedback ?? null,
      clientReviewedAt: item.client_reviewed_at ?? null,
      url: download.ok ? download.url : null,
    };
  }));

  const generated = new Date().toISOString();
  const clientApproved = rows.filter((row) => row.clientStatus === "approved").length;
  const revisionRequested = rows.filter((row) => row.clientStatus === "revision_requested").length;
  const awaitingClient = rows.length - clientApproved - revisionRequested;
  const jobRows = project.job as unknown as Array<{ title?: string | null; location?: string | null }> | { title?: string | null; location?: string | null } | null;
  const job = Array.isArray(jobRows) ? jobRows[0] : jobRows;
  const missionTitle = job?.title ?? "—";
  const missionLocation = job?.location ?? null;
  const manifest = [
    "DOMINIC — DELIVERY MANIFEST",
    "Drone Operation Management",
    "Uniquely Sophisticated",
    "DroneOpsMan.com",
    "",
    `Project: ${project.name}`,
    `Project ID: ${project.id}`,
    `Mission: ${missionTitle}`,
    `Location: ${project.location_snapshot ?? missionLocation ?? "—"}`,
    `Source images: ${project.image_count ?? 0}`,
    `Processing completed: ${project.processing_completed_at ?? "—"}`,
    `Manifest generated: ${generated}`,
    "",
    `QC-APPROVED DELIVERABLES (${rows.length})`,
    `Client approved: ${clientApproved}`,
    `Awaiting client review: ${awaitingClient}`,
    `Revision requested: ${revisionRequested}`,
    "",
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${row.name}`,
      `   Type: ${row.type}`,
      `   Client review: ${row.clientStatus ? titleCase(row.clientStatus) : "Awaiting Review"}`,
      ...(row.clientReviewedAt ? [`   Reviewed: ${row.clientReviewedAt}`] : []),
      ...(row.clientFeedback ? [`   Client note: ${row.clientFeedback}`] : []),
      `   Download: ${row.url ?? "Unavailable"}`,
    ]),
    "",
    "Files listed here passed DOM QC at the time this manifest was generated.",
    "Client review status reflects the latest recorded approval or revision decision in DOM at manifest generation time.",
    "Download links are short-lived and may expire. Return to DOMINIC to generate fresh links.",
    "Professional geospatial source files are preserved without burned-in visual watermarks.",
    "",
    "DOMINIC · Intelligent Mapping by DOM · Drone Operation Management · Uniquely Sophisticated",
  ].join("\n");

  return new NextResponse(manifest, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="DOMINIC_${project.name.replace(/[^a-zA-Z0-9]+/g, "-")}_Delivery-Manifest.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
