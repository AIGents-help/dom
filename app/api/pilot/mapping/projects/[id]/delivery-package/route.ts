import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { getDeliverableDownloadUrl } from "@/lib/mapperStorage";

export const runtime = "nodejs";

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "deliverable";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data: project } = await admin.from("mapping_projects")
    .select("id,name,location_snapshot,image_count,processing_completed_at,job_id,job:jobs(title,location)")
    .eq("id", id).eq("contractor_id", auth.contractor.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: deliverables } = await admin.from("deliverables")
    .select("id,name,type,storage_url,storage_provider,external_file_id,qc_passed,client_status,client_feedback,client_reviewed_at,revision_number,delivered_at,created_at")
    .eq("job_id", project.job_id)
    .eq("qc_passed", true)
    .or("client_status.is.null,client_status.neq.superseded")
    .order("created_at");

  const files = await Promise.all((deliverables ?? []).map(async (item) => {
    const download = await getDeliverableDownloadUrl(item, id);
    return {
      id: item.id,
      filename: `DOMINIC_${safeName(project.name)}_${safeName(item.name)}${Number(item.revision_number ?? 1) > 1 ? `_Rev-${item.revision_number}` : ""}`,
      displayName: item.name,
      type: item.type ?? "output",
      revision: Number(item.revision_number ?? 1),
      clientStatus: item.client_status ?? "awaiting_review",
      clientFeedback: item.client_feedback ?? null,
      clientReviewedAt: item.client_reviewed_at ?? null,
      deliveredAt: item.delivered_at ?? null,
      downloadUrl: download.ok ? download.url : null,
    };
  }));

  const jobRows = project.job as unknown as Array<{ title?: string | null; location?: string | null }> | { title?: string | null; location?: string | null } | null;
  const job = Array.isArray(jobRows) ? jobRows[0] : jobRows;
  const packageManifest = {
    format: "DOMINIC_DELIVERY_PACKAGE_V1",
    generatedAt: new Date().toISOString(),
    brand: {
      product: "DOMINIC",
      descriptor: "Intelligent Mapping by DOM",
      company: "Drone Operation Management",
      tagline: "Uniquely Sophisticated",
      website: "DroneOpsMan.com",
    },
    project: {
      id: project.id,
      name: project.name,
      mission: job?.title ?? "DOM Mission",
      location: project.location_snapshot ?? job?.location ?? null,
      sourceImages: project.image_count ?? 0,
      processingCompletedAt: project.processing_completed_at ?? null,
    },
    includedFiles: files.length,
    files,
    companionArtifacts: {
      pdfReport: `/api/pilot/mapping/projects/${id}/report`,
      textManifest: `/api/pilot/mapping/projects/${id}/delivery-manifest`,
    },
    notes: [
      "Only current, QC-passed deliverables are listed.",
      "Superseded revision history is excluded from client handoff.",
      "Professional geospatial source files are preserved without destructive visual watermarks.",
      "Secure download URLs are short-lived; regenerate this package manifest when links expire.",
    ],
  };

  return NextResponse.json(packageManifest, {
    headers: {
      "Content-Disposition": `attachment; filename="DOMINIC_${safeName(project.name)}_Delivery-Package.json"`,
      "Cache-Control": "no-store",
    },
  });
}
