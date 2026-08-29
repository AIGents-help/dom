import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "customer-documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function context(req: NextRequest, leadId: string) {
  if (!(await isAdminRequest(req))) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const admin = getSupabaseAdmin();
  const [{ data: auth }, { data: lead }] = await Promise.all([
    admin.auth.getUser(token),
    admin.from("leads").select("id").eq("id", leadId).maybeSingle(),
  ]);
  return auth.user && lead ? { admin, user: auth.user } : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(req, id);
  if (!ctx) return NextResponse.json({ error: "CRM file not found or admin access required." }, { status: 403 });
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (documentId) {
    const { data: document } = await ctx.admin.from("customer_documents").select("storage_path").eq("id", documentId).eq("lead_id", id).maybeSingle();
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const { data, error } = await ctx.admin.storage.from(BUCKET).createSignedUrl(document.storage_path, 300);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not open document." }, { status: 500 });
    return NextResponse.json({ url: data.signedUrl });
  }
  const { data, error } = await ctx.admin.from("customer_documents").select("id,original_name,description,mime_type,size_bytes,created_at").eq("lead_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(req, id);
  if (!ctx) return NextResponse.json({ error: "CRM file not found or admin access required." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  const description = String(form.get("description") ?? "").trim().slice(0, 500) || null;
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a document to attach." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Documents cannot exceed 25 MB." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use PDF, Word, Excel, CSV, TXT, JPG, PNG, or WebP files." }, { status: 400 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "document";
  const storagePath = `${id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await ctx.admin.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const { data, error } = await ctx.admin.from("customer_documents").insert({ lead_id: id, storage_path: storagePath, original_name: file.name.slice(0, 255), description, mime_type: file.type, size_bytes: file.size, uploaded_by: ctx.user.id }).select("id,original_name,description,mime_type,size_bytes,created_at").single();
  if (error) {
    await ctx.admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ document: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(req, id);
  if (!ctx) return NextResponse.json({ error: "CRM file not found or admin access required." }, { status: 403 });
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Document id is required." }, { status: 400 });
  const { data: document } = await ctx.admin.from("customer_documents").select("storage_path").eq("id", documentId).eq("lead_id", id).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const { error: storageError } = await ctx.admin.storage.from(BUCKET).remove([document.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  const { error } = await ctx.admin.from("customer_documents").delete().eq("id", documentId).eq("lead_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
