import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// GET /api/pilot/mapping/projects/[id]/deliverables/[deliverableId]/potree
// Mints short-lived signed URLs for the three Potree 2.x octree files
// (metadata.json/octree.bin/hierarchy.bin) of a point_cloud deliverable.
// Deliberately separate from the generic download route: the Potree viewer
// issues many small, repeated, Range-requested reads while panning/loading
// LOD nodes, so it gets real Supabase Storage signed URLs (native Range
// support) that the browser fetches directly -- not proxied through this
// server per-request, unlike the Drive download/file proxy used for
// one-shot whole-file downloads.
const SIGNED_URL_TTL_SECONDS = 3600;

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
    .select("id, potree")
    .eq("id", deliverableId)
    .eq("job_id", project.job_id)
    .maybeSingle();
  if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });

  const potree = deliverable.potree as { provider: "supabase"; metadata: string; octree: string; hierarchy: string } | null;
  if (!potree || potree.provider !== "supabase") {
    return NextResponse.json({ error: "Point cloud viewer data isn't available for this deliverable yet." }, { status: 404 });
  }

  const bucket = admin.storage.from("mapper-potree");
  const [metadataUrl, octreeUrl, hierarchyUrl] = await Promise.all([
    bucket.createSignedUrl(potree.metadata, SIGNED_URL_TTL_SECONDS),
    bucket.createSignedUrl(potree.octree, SIGNED_URL_TTL_SECONDS),
    bucket.createSignedUrl(potree.hierarchy, SIGNED_URL_TTL_SECONDS),
  ]);

  if (metadataUrl.error || octreeUrl.error || hierarchyUrl.error) {
    const log = [metadataUrl.error, octreeUrl.error, hierarchyUrl.error].filter(Boolean).map((e) => e!.message).join("; ");
    console.error(`[mapping/deliverables/potree] Could not sign Potree URLs for deliverable ${deliverableId}: ${log}`);
    return NextResponse.json({ error: "Point cloud files unavailable." }, { status: 502 });
  }

  return NextResponse.json({
    metadataUrl: metadataUrl.data.signedUrl,
    octreeUrl: octreeUrl.data.signedUrl,
    hierarchyUrl: hierarchyUrl.data.signedUrl,
  });
}
