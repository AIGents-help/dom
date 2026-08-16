import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { WORKFLOW_ITEMS } from "@/lib/missionWorkflow";

async function context(req: NextRequest, assignmentId: string) {
  const header = req.headers.get("authorization"); if (!header) return null;
  const sb = getSupabaseAnonServer(header); const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors").select("id,part107_verified,insurance_verified,insurance_provider,insurance_policy_number,insurance_expires_on,insurance_liability_cents,dom_gig_insurance_eligible").eq("user_id", user.id).maybeSingle(); if (!contractor) return null;
  const { data: assignment } = await admin.from("mission_assignments").select("id,job_id,contractor_id,status,assigned_uav,insurance_source,mission_insurance_verified,mission_insurance_reference,mission_insurance_expires_at,job:jobs(mission_request_id,scheduled_for,checked_in_at,started_at,completed_at)").eq("id", assignmentId).eq("contractor_id", contractor.id).maybeSingle();
  return assignment ? { admin, user, assignment, contractor } : null;
}

function coverage(x: NonNullable<Awaited<ReturnType<typeof context>>>) {
  const profileCurrent = x.contractor.insurance_verified && !!x.contractor.insurance_expires_on && new Date(`${x.contractor.insurance_expires_on}T23:59:59`).getTime() > Date.now();
  const gigCurrent = x.assignment.insurance_source === "dom_gig" && x.assignment.mission_insurance_verified && (!x.assignment.mission_insurance_expires_at || new Date(x.assignment.mission_insurance_expires_at).getTime() > Date.now());
  return { verified: profileCurrent || gigCurrent, source: gigCurrent ? "DOM-provided gig policy" : profileCurrent ? `${x.contractor.insurance_provider ?? "Pilot"} policy` : null, expiresOn: gigCurrent ? x.assignment.mission_insurance_expires_at : x.contractor.insurance_expires_on, reference: gigCurrent ? x.assignment.mission_insurance_reference : x.contractor.insurance_policy_number, gigEligible: x.contractor.dom_gig_insurance_eligible };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params; const x = await context(req, assignmentId); if (!x) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  await x.admin.from("mission_checklist_items").upsert(WORKFLOW_ITEMS.map(([phase, key, label], i) => ({ assignment_id: assignmentId, phase, item_key: key, label, sort_order: i })), { onConflict: "assignment_id,phase,item_key", ignoreDuplicates: true });
  const insurance = coverage(x); const now = new Date().toISOString();
  await x.admin.from("mission_checklist_items").update({ completed: insurance.verified, completed_at: insurance.verified ? now : null, notes: insurance.verified ? `${insurance.source}${insurance.reference ? ` · ${insurance.reference}` : ""}` : "Insurance verification required" }).eq("assignment_id", assignmentId).eq("item_key", "insurance_verified");
  const { data: items } = await x.admin.from("mission_checklist_items").select("*").eq("assignment_id", assignmentId).order("sort_order"); const job: any = Array.isArray(x.assignment.job) ? x.assignment.job[0] : x.assignment.job;
  const blocking:string[]=[];const cautions:string[]=[];
  if(!insurance.verified)blocking.push("Mission insurance is not verified");
  if(!x.contractor.part107_verified)blocking.push("Part 107 verification is not current");
  if(!x.assignment.assigned_uav)blocking.push("A compatible UAV has not been assigned");
  if(!job?.scheduled_for)cautions.push("Mission performance date is not scheduled");
  const requiredIncomplete=(items??[]).filter((item:any)=>item.required&&!item.completed&&item.item_key!=="insurance_verified");
  if(requiredIncomplete.length)cautions.push(`${requiredIncomplete.length} required readiness item${requiredIncomplete.length===1?" is":"s are"} incomplete`);
  const level=blocking.length?"no_go":cautions.length?"caution":"go";
  return NextResponse.json({ items: items ?? [], job, insurance, readiness:{level,blocking,cautions,requiredIncomplete:requiredIncomplete.map((item:any)=>({id:item.id,label:item.label,phase:item.phase}))} });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params; const x = await context(req, assignmentId); if (!x) return NextResponse.json({ error: "Not authorized" }, { status: 401 }); const body = await req.json(); const insurance = coverage(x);
  if (!insurance.verified && body.action !== "incident") return NextResponse.json({ error: "Verified insurance is mandatory. Upload a current COI in Pilot Profile or ask DOM to bind approved gig coverage before continuing." }, { status: 409 });
  if (["check_in", "start_flight", "field_complete"].includes(body.action) && !x.contractor.part107_verified) return NextResponse.json({ error: "Part 107 verification is required before field operations." }, { status: 409 });
  if (["check_in", "start_flight", "field_complete"].includes(body.action) && !x.assignment.assigned_uav) return NextResponse.json({ error: "Assign a compatible UAV before field operations." }, { status: 409 });
  const job: any = Array.isArray(x.assignment.job) ? x.assignment.job[0] : x.assignment.job; const now = new Date().toISOString();
  if (body.action === "checklist") { const { data: item } = await x.admin.from("mission_checklist_items").select("item_key").eq("id", body.itemId).eq("assignment_id", assignmentId).maybeSingle(); if (item?.item_key === "insurance_verified") return NextResponse.json({ error: "Insurance verification is controlled automatically by DOM." }, { status: 409 }); await x.admin.from("mission_checklist_items").update({ completed: !!body.completed, completed_at: body.completed ? now : null }).eq("id", body.itemId).eq("assignment_id", assignmentId); }
  else if (["check_in", "start_flight", "field_complete"].includes(body.action)) { const column = body.action === "check_in" ? "checked_in_at" : body.action === "start_flight" ? "started_at" : "completed_at"; await x.admin.from("jobs").update({ [column]: now }).eq("id", x.assignment.job_id); await x.admin.from("mission_activity_events").insert({ mission_request_id: job.mission_request_id, job_id: x.assignment.job_id, assignment_id: assignmentId, actor_user_id: x.user.id, actor_role: "pilot", visibility: "shared", event_type: body.action, summary: body.action === "check_in" ? "Pilot checked in on site" : body.action === "start_flight" ? "Flight operations started" : "Field capture completed" }); }
  else if (body.action === "incident") { if (!body.summary) return NextResponse.json({ error: "Incident summary required" }, { status: 400 }); await x.admin.from("mission_incidents").insert({ assignment_id: assignmentId, severity: body.severity ?? "observation", occurred_at: now, summary: String(body.summary).slice(0, 500), details: String(body.details ?? "").slice(0, 5000), operations_paused: !!body.operationsPaused, reported_by: x.user.id }); }
  else return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
