import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import {
  canPilotUpload,
  MAX_PILOT_UPLOAD_BYTES,
  isPathWithinRoot,
  isPilotFileKind,
  pilotStorageConfig,
  sanitizeStorageFileName,
  validatePilotUpload,
} from "@/lib/pilotMissionFiles";

interface AssignmentContext {
  id: string;
  status: string;
  job_id: string;
  job: { id: string; mission_request_id: string } | null;
}

async function assignmentContext(req: NextRequest, assignmentId: string) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return auth;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("mission_assignments")
    .select("id,status,job_id,job:jobs(id,mission_request_id)")
    .eq("id", assignmentId)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();

  if (error) return { error: "Could not load this mission.", status: 500 };
  if (!data) return { error: "Mission not found.", status: 404 };

  const relation = Array.isArray(data.job) ? data.job[0] : data.job;
  if (!relation) return { error: "This assignment is not linked to a job.", status: 409 };
  return {
    admin,
    actorUserId: auth.contractor.user_id,
    assignment: { ...data, job: relation } as AssignmentContext,
  };
}

async function signedDownloadUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = await getSupabaseAdmin().storage.from(bucket).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await assignmentContext(req, assignmentId);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const missionRequestId = ctx.assignment.job!.mission_request_id;
  const [{ data: documents, error: documentsError }, { data: deliverables, error: deliverablesError }] = await Promise.all([
    ctx.admin
      .from("mission_documents")
      .select("id,category,name,file_url,is_required,is_completed")
      .eq("mission_request_id", missionRequestId)
      .order("sort_order"),
    ctx.admin
      .from("deliverables")
      .select("id,name,type,storage_url,qc_passed")
      .eq("job_id", ctx.assignment.job_id)
      .order("created_at"),
  ]);

  if (documentsError || deliverablesError) {
    return NextResponse.json({ error: "Mission files could not be loaded." }, { status: 500 });
  }

  const documentsWithUrls = await Promise.all((documents ?? []).map(async (row) => ({
    ...row,
    download_url: await signedDownloadUrl("mission-documents", row.file_url),
  })));
  const deliverablesWithUrls = await Promise.all((deliverables ?? []).map(async (row) => ({
    ...row,
    download_url: await signedDownloadUrl("mission-deliverables", row.storage_url),
  })));

  return NextResponse.json({
    documents: documentsWithUrls,
    deliverables: deliverablesWithUrls,
    canUpload: canPilotUpload(ctx.assignment.status),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await assignmentContext(req, assignmentId);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!canPilotUpload(ctx.assignment.status)) {
    return NextResponse.json({ error: "Files cannot be changed after mission approval or cancellation." }, { status: 409 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const missionRequestId = ctx.assignment.job!.mission_request_id;

  if (body.action === "prepare_upload") {
    const validationError = validatePilotUpload({
      kind: body.kind,
      name: body.name,
      category: body.category,
      fileName: body.fileName,
      fileSize: body.fileSize,
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    if (!isPilotFileKind(body.kind)) return NextResponse.json({ error: "Invalid file type." }, { status: 400 });

    const config = pilotStorageConfig(body.kind, missionRequestId, ctx.assignment.job_id);
    const path = `${config.rootId}/${randomUUID()}-${sanitizeStorageFileName(String(body.fileName))}`;
    const { data, error } = await ctx.admin.storage.from(config.bucket).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: "Could not prepare the upload. Try again." }, { status: 500 });

    return NextResponse.json({ bucket: config.bucket, path, token: data.token });
  }

  if (body.action === "complete_upload") {
    if (!isPilotFileKind(body.kind) || typeof body.path !== "string") {
      return NextResponse.json({ error: "Invalid upload confirmation." }, { status: 400 });
    }
    const validationError = validatePilotUpload({
      kind: body.kind,
      name: body.name,
      category: body.category,
      fileName: body.fileName,
      fileSize: body.fileSize,
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const config = pilotStorageConfig(body.kind, missionRequestId, ctx.assignment.job_id);
    if (!isPathWithinRoot(body.path, config.rootId)) {
      return NextResponse.json({ error: "The uploaded file is outside this mission." }, { status: 400 });
    }

    const parts = body.path.split("/");
    const objectName = parts.pop();
    const folder = parts.join("/");
    const { data: objects, error: listError } = await ctx.admin.storage.from(config.bucket).list(folder, { search: objectName, limit: 10 });
    const uploadedObject = objects?.find((object) => object.name === objectName);
    if (listError || !uploadedObject) {
      return NextResponse.json({ error: "Upload confirmation failed. Please upload the file again." }, { status: 409 });
    }
    const actualSize = Number(uploadedObject.metadata?.size ?? body.fileSize);
    if (!Number.isFinite(actualSize) || actualSize <= 0 || actualSize > MAX_PILOT_UPLOAD_BYTES) {
      await ctx.admin.storage.from(config.bucket).remove([body.path]);
      return NextResponse.json({ error: "The uploaded file must be between 1 byte and 250 MB." }, { status: 400 });
    }

    const name = String(body.name).trim().slice(0, 160);
    const category = String(body.category);
    const result = body.kind === "document"
      ? await ctx.admin.from("mission_documents").insert({
          mission_request_id: missionRequestId,
          name,
          category,
          file_url: body.path,
          is_required: false,
        })
      : await ctx.admin.from("deliverables").insert({
          job_id: ctx.assignment.job_id,
          name,
          type: category,
          storage_url: body.path,
          storage_provider: "supabase",
        });

    if (result.error) {
      await ctx.admin.storage.from(config.bucket).remove([body.path]);
      return NextResponse.json({ error: "The file uploaded, but could not be added to the mission. Please try again." }, { status: 500 });
    }

    if (body.kind === "deliverable") {
      const now = new Date().toISOString();
      await Promise.all([
        ctx.admin.from("mission_checklist_items").upsert({
          assignment_id: assignmentId,
          phase: "submission",
          item_key: "deliverables_uploaded",
          label: "Upload required files and field notes",
          sort_order: 19,
          completed: true,
          completed_at: now,
        }, { onConflict: "assignment_id,phase,item_key" }),
        ctx.admin.from("mission_activity_events").insert({
          mission_request_id: missionRequestId,
          job_id: ctx.assignment.job_id,
          assignment_id: assignmentId,
          actor_user_id: ctx.actorUserId,
          actor_role: "pilot",
          visibility: "shared",
          event_type: "deliverable_uploaded",
          summary: `Pilot uploaded deliverable: ${name}`,
        }),
      ]);
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
