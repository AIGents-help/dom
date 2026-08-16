import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export async function POST(req: NextRequest) {
  try {
    const { email, password, action } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: client } = await admin.from("clients").select("id, company_name, contact_name, user_id").ilike("email", email.trim()).maybeSingle();
    if (!client) return NextResponse.json({ error: "No DOM client account exists for this email." }, { status: 403 });

    const supabase = getSupabaseAnonServer();
    const result = action === "activate"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error || !result.data.user) return NextResponse.json({ error: result.error?.message ?? "Access failed" }, { status: 401 });

    if (!client.user_id) await admin.from("clients").update({ user_id: result.data.user.id }).eq("id", client.id).is("user_id", null);
    else if (client.user_id !== result.data.user.id) return NextResponse.json({ error: "This client account is linked to another login." }, { status: 403 });

    return NextResponse.json({ session: result.data.session, confirmationRequired: !result.data.session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Client access failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getSupabaseAnonServer(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("clients").select("id, company_name, contact_name, email").eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client profile not found" }, { status: 404 });

  const { data: jobs } = await admin.from("jobs").select(`
    id, title, service_type, location, scheduled_for, status, created_at,
    mission_request:mission_requests(id, status, scope, quoted_amount_cents),
    assignments:mission_assignments(id, status, assigned_uav, contractor:contractors(full_name, slug)),
    deliverables(id, name, type, qc_passed, client_status, delivered_at),
    payments(id, amount_total_cents, status, created_at)
  `).eq("client_id", client.id).order("created_at", { ascending: false });
  const missionIds = (jobs ?? []).map((job: any) => (Array.isArray(job.mission_request) ? job.mission_request[0] : job.mission_request)?.id).filter(Boolean);
  const { data: activity } = missionIds.length ? await admin.from("mission_activity_events").select("id, mission_request_id, event_type, summary, created_at").in("mission_request_id", missionIds).in("visibility", ["client", "shared"]).order("created_at", { ascending: false }) : { data: [] };
  const { data: changes } = missionIds.length ? await admin.from("mission_change_orders").select("id, mission_request_id, title, reason, amount_delta_cents, status, created_at").in("mission_request_id", missionIds).order("created_at", { ascending: false }) : { data: [] };
  return NextResponse.json({ client, jobs: jobs ?? [], activity: activity ?? [], changeOrders: changes ?? [] });
}
