import { NextRequest, NextResponse } from "next/server";
import { adminMessageTimestamps, parseAdminMessageUpdate } from "@/lib/adminMessage";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function authenticate(req: NextRequest) {
  if (!(await isAdminRequest(req))) return null;
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const admin = getSupabaseAdmin();
  const { data: { user } } = await admin.auth.getUser(token);
  return user ? { admin, email: user.email ?? null } : null;
}

export async function GET(req: NextRequest) {
  const context = await authenticate(req);
  if (!context) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const [{ data: messages, error: messagesError }, { data: notifications, error: notificationsError }] = await Promise.all([
    context.admin.from("admin_messages").select("*").order("created_at", { ascending: false }).limit(500),
    context.admin.from("notification_log")
      .select("id,recipient_type,recipient_email,email_type,status,subject,error_message,sent_at,delivered_at,opened_at,clicked_at,created_at,mission_request_id,job_id,assignment_id,metadata,idempotency_key")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (messagesError || notificationsError) {
    return NextResponse.json({ error: messagesError?.message ?? notificationsError?.message }, { status: 500 });
  }
  return NextResponse.json({ messages: messages ?? [], notifications: notifications ?? [] });
}

export async function PATCH(req: NextRequest) {
  const context = await authenticate(req);
  if (!context) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = parseAdminMessageUpdate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: parsed.value.status, read_by: context.email, updated_at: now, ...adminMessageTimestamps(parsed.value.status, now) };
  if (parsed.value.adminNote !== undefined) patch.admin_note = parsed.value.adminNote;
  const { data, error } = await context.admin.from("admin_messages").update(patch).eq("id", parsed.value.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
