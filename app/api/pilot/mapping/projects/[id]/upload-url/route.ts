import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { UPLOADABLE_PROJECT_STATUSES } from "@/lib/mapperPipeline";

// POST /api/pilot/mapping/projects/[id]/upload-url  { filenames: string[] }
// Issues one Supabase Storage signed UPLOAD url+token per filename, so the
// browser uploads image bytes directly to Storage — never through this
// Vercel function's request body. Object paths are namespaced
// `{mapping_project_id}/{uuid}-{filename}`, matching the folder-scoped RLS
// policy on the mapping-uploads bucket. Max 200 filenames per call — the
// browser is expected to call this in batches for a large shoot.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, status")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!UPLOADABLE_PROJECT_STATUSES.includes(project.status)) {
    return NextResponse.json({ error: `Can't upload while project is "${project.status}".` }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const filenames: unknown[] = Array.isArray(body?.filenames) ? body.filenames : [];
  if (filenames.length === 0) {
    return NextResponse.json({ error: "filenames[] is required." }, { status: 400 });
  }
  if (filenames.length > 200) {
    return NextResponse.json({ error: "Request at most 200 upload URLs per call." }, { status: 400 });
  }

  const results = await Promise.all(
    filenames.map(async (raw) => {
      const filename = String(raw);
      const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-180);
      const path = `${project.id}/${crypto.randomUUID()}-${safe}`;
      const { data, error } = await admin.storage.from("mapping-uploads").createSignedUploadUrl(path);
      if (error) return { filename, error: error.message };
      return { filename, path, token: data.token, signedUrl: data.signedUrl };
    })
  );

  if (project.status === "draft") {
    await admin.from("mapping_projects").update({ status: "uploading" }).eq("id", project.id);
  }

  return NextResponse.json({ uploads: results });
}
