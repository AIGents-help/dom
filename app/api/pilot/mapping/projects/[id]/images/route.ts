import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// GET /api/pilot/mapping/projects/[id]/images — list images for a project.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin.from("mapping_projects").select("id").eq("id", id).eq("contractor_id", auth.contractor.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: images, error } = await admin.from("mapping_images").select("*").eq("mapping_project_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ images: images ?? [] });
}

// POST /api/pilot/mapping/projects/[id]/images
// Confirms a completed direct-to-storage upload and records its metadata.
// Only basic file facts are ever trusted from the browser (size, mime
// type, pixel dimensions, checksum) — camera make/model, captured_at, and
// GPS lat/lng/altitude are intentionally NOT accepted here. Those fields
// stay null until the worker's authoritative server-side EXIF extraction
// fills them in during processing (see services/mapper-worker).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: project } = await admin
    .from("mapping_projects")
    .select("id, image_count, total_upload_bytes")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.storage_path || !body?.original_filename) {
    return NextResponse.json({ error: "storage_path and original_filename are required." }, { status: 400 });
  }
  // storage_path is client-supplied (it's the path the upload-url route
  // issued earlier) — verify it's actually within THIS project's folder
  // before trusting it. Without this, a caller could reference a real
  // object path belonging to a different project/contractor and have the
  // worker (service-role, bypasses Storage RLS) download and process it as
  // if it were their own imagery.
  if (typeof body.storage_path !== "string" || !body.storage_path.startsWith(`${project.id}/`)) {
    return NextResponse.json({ error: "storage_path does not belong to this project." }, { status: 403 });
  }

  const fileSize = typeof body.file_size === "number" ? body.file_size : null;

  const { data: image, error } = await admin
    .from("mapping_images")
    .insert({
      mapping_project_id: project.id,
      storage_path: body.storage_path,
      original_filename: body.original_filename,
      file_size: fileSize,
      mime_type: body.mime_type ?? null,
      checksum: body.checksum ?? null,
      image_width: typeof body.image_width === "number" ? body.image_width : null,
      image_height: typeof body.image_height === "number" ? body.image_height : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This image was already uploaded to this project (duplicate checksum)." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin
    .from("mapping_projects")
    .update({
      image_count: project.image_count + 1,
      total_upload_bytes: project.total_upload_bytes + (fileSize ?? 0),
      status: "uploaded",
    })
    .eq("id", project.id);

  return NextResponse.json({ ok: true, imageId: image.id });
}
