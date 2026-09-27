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
    const normalizedEmail = email.trim();
    const result = action === "activate"
      ? await supabase.auth.signUp({ email: normalizedEmail, password })
      : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (result.error || !result.data.user) return NextResponse.json({ error: result.error?.message ?? "Access failed" }, { status: 401 });

    // Never bind a client record to a newly-created auth identity until that
    // identity has a real session. With email confirmation enabled, signUp
    // returns a user before ownership of the email address has been proven.
    if (action === "activate" && !result.data.session) {
      return NextResponse.json({ session: null, confirmationRequired: true });
    }

    if (!client.user_id) {
      const { data: linkedClient, error: linkError } = await admin
        .from("clients")
        .update({ user_id: result.data.user.id })
        .eq("id", client.id)
        .is("user_id", null)
        .select("user_id")
        .maybeSingle();
      if (linkError) return NextResponse.json({ error: "Client account could not be linked." }, { status: 500 });
      if (!linkedClient) {
        const { data: currentClient } = await admin.from("clients").select("user_id").eq("id", client.id).maybeSingle();
        if (currentClient?.user_id !== result.data.user.id) {
          return NextResponse.json({ error: "This client account is linked to another login." }, { status: 403 });
        }
      }
    } else if (client.user_id !== result.data.user.id) {
      return NextResponse.json({ error: "This client account is linked to another login." }, { status: 403 });
    }

    return NextResponse.json({ session: result.data.session, confirmationRequired: false });
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

  const { data: jobs, error: jobsError } = await admin.from("jobs").select(`
    id, title, service_type, location, scheduled_for, status, created_at,
    mission_request:mission_requests(id, status, scope, quoted_amount_cents, created_by_contractor_id),
    assignments:mission_assignments(id, status, assigned_uav, contractor:contractors(full_name, slug)),
    deliverables(id, name, type, qc_passed, client_status, client_feedback, client_reviewed_at, supersedes_deliverable_id, revision_number, delivered_at)
  `).eq("client_id", client.id).order("created_at", { ascending: false });
  if (jobsError) return NextResponse.json({ error: "Client missions could not be loaded." }, { status: 500 });

  const { data: payments, error: paymentsError } = await admin
    .from("payments")
    .select("id, mission_request_id, amount_total_cents, status, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });
  if (paymentsError) return NextResponse.json({ error: "Client payments could not be loaded." }, { status: 500 });
  const missionIds = (jobs ?? []).map((job: any) => (Array.isArray(job.mission_request) ? job.mission_request[0] : job.mission_request)?.id).filter(Boolean);
  const { data: activity } = missionIds.length ? await admin.from("mission_activity_events").select("id, mission_request_id, event_type, summary, created_at").in("mission_request_id", missionIds).in("visibility", ["client", "shared"]).order("created_at", { ascending: false }) : { data: [] };
  const [{ data: changes }, { data: quotes }] = missionIds.length ? await Promise.all([
    admin.from("mission_change_orders").select("id, mission_request_id, title, reason, scope_delta, amount_delta_cents, status, sent_at, responded_at, client_response_notes, created_at").in("mission_request_id", missionIds).order("created_at", { ascending: false }),
    admin.from("quotes").select("id, mission_request_id, service_type, total_cents, status, version_number, sent_at, accepted_at, rejected_at, expires_at, client_response_notes, created_at").in("mission_request_id", missionIds).neq("status", "draft").order("version_number", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const paymentsByMission = new Map<string, any[]>();
  for (const payment of payments ?? []) {
    if (!payment.mission_request_id) continue;
    const group = paymentsByMission.get(payment.mission_request_id) ?? [];
    group.push(payment);
    paymentsByMission.set(payment.mission_request_id, group);
  }

  const clientJobs = (jobs ?? []).map((job: any) => {
    const missionRequest = Array.isArray(job.mission_request) ? job.mission_request[0] : job.mission_request;
    return {
    ...job,
    payments: missionRequest?.id ? paymentsByMission.get(missionRequest.id) ?? [] : [],
    // Never expose pre-QC corrections or superseded revision history in the
    // active client handoff. History remains available to DOM internally.
    deliverables: (job.deliverables ?? []).filter(
      (deliverable: any) => deliverable.qc_passed === true && !["superseded", "revision_requested"].includes(deliverable.client_status ?? "")
    ),
  };
  });

  return NextResponse.json({ client, jobs: clientJobs, activity: activity ?? [], changeOrders: changes ?? [], quotes: quotes ?? [] });
}
