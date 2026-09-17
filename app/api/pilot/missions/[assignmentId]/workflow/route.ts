import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { deliverablePlanFor, missingRequiredDeliverables, WORKFLOW_ITEMS } from "@/lib/missionWorkflow";

interface WorkflowJob {
  mission_request_id: string;
  service_type: string | null;
  scheduled_for: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}
interface WorkflowContext {
  admin: ReturnType<typeof getSupabaseAdmin>;
  user: { id: string };
  assignment: {
    job_id: string; status: string; assigned_uav: string | null;
    insurance_source: string | null; mission_insurance_verified: boolean;
    mission_insurance_reference: string | null; mission_insurance_expires_at: string | null;
    job: WorkflowJob;
  };
  contractor: {
    part107_verified: boolean; insurance_verified: boolean;
    insurance_provider: string | null; insurance_policy_number: string | null;
    insurance_expires_on: string | null; dom_gig_insurance_eligible: boolean;
  };
}

async function context(req: NextRequest, assignmentId: string): Promise<WorkflowContext | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const sb = getSupabaseAnonServer(header);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors")
    .select("id,part107_verified,insurance_verified,insurance_provider,insurance_policy_number,insurance_expires_on,dom_gig_insurance_eligible")
    .eq("user_id", user.id).maybeSingle();
  if (!contractor) return null;
  const { data: assignment } = await admin.from("mission_assignments")
    .select("job_id,status,assigned_uav,insurance_source,mission_insurance_verified,mission_insurance_reference,mission_insurance_expires_at,job:jobs(mission_request_id,service_type,scheduled_for,checked_in_at,started_at,completed_at)")
    .eq("id", assignmentId).eq("contractor_id", contractor.id).maybeSingle();
  if (!assignment) return null;
  const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
  if (!job) return null;
  return { admin, user, assignment: { ...assignment, job } as WorkflowContext["assignment"], contractor };
}

function coverage(ctx: WorkflowContext) {
  const profileCurrent = ctx.contractor.insurance_verified && !!ctx.contractor.insurance_expires_on
    && new Date(`${ctx.contractor.insurance_expires_on}T23:59:59`).getTime() > Date.now();
  const gigCurrent = ctx.assignment.insurance_source === "dom_gig" && ctx.assignment.mission_insurance_verified
    && (!ctx.assignment.mission_insurance_expires_at || new Date(ctx.assignment.mission_insurance_expires_at).getTime() > Date.now());
  return {
    verified: profileCurrent || gigCurrent,
    source: gigCurrent ? "DOM-provided gig policy" : profileCurrent ? `${ctx.contractor.insurance_provider ?? "Pilot"} policy` : null,
    expiresOn: gigCurrent ? ctx.assignment.mission_insurance_expires_at : ctx.contractor.insurance_expires_on,
    reference: gigCurrent ? ctx.assignment.mission_insurance_reference : ctx.contractor.insurance_policy_number,
    gigEligible: ctx.contractor.dom_gig_insurance_eligible,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await context(req, assignmentId);
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { error: seedError } = await ctx.admin.from("mission_checklist_items").upsert(
    WORKFLOW_ITEMS.map(([phase, key, label], index) => ({ assignment_id: assignmentId, phase, item_key: key, label, sort_order: index })),
    { onConflict: "assignment_id,phase,item_key", ignoreDuplicates: true },
  );
  if (seedError) return NextResponse.json({ error: "Field workflow could not be initialized." }, { status: 500 });

  const insurance = coverage(ctx);
  const [{ data: deliverables, error: deliverablesError }] = await Promise.all([
    ctx.admin.from("deliverables").select("id,type").eq("job_id", ctx.assignment.job_id),
  ]);
  if (deliverablesError) return NextResponse.json({ error: "Field workflow could not be loaded." }, { status: 500 });

  const now = new Date().toISOString();
  const submitted = ["submitted", "qc_passed", "paid"].includes(ctx.assignment.status);
  const missingDeliverables = missingRequiredDeliverables(ctx.assignment.job.service_type, (deliverables ?? []).map((item) => item.type));
  const deliverablesComplete = missingDeliverables.length === 0;
  const automaticStates = [
    { key: "uav_assigned", completed: !!ctx.assignment.assigned_uav, notes: ctx.assignment.assigned_uav ? `Assigned aircraft: ${ctx.assignment.assigned_uav}` : "Assign a compatible UAV" },
    { key: "insurance_verified", completed: insurance.verified, notes: insurance.verified ? `${insurance.source}${insurance.reference ? ` · ${insurance.reference}` : ""}` : "Insurance verification required" },
    { key: "capture_complete", completed: !!ctx.assignment.job.completed_at, notes: ctx.assignment.job.completed_at ? "Field capture marked complete" : "Complete the approved capture plan" },
    { key: "deliverables_uploaded", completed: deliverablesComplete, notes: deliverablesComplete ? "Every required deliverable category is uploaded" : `Still required: ${missingDeliverables.map((item) => item.label).join(", ")}` },
    { key: "mission_submitted", completed: submitted, notes: submitted ? "Submitted to DOM for QC" : "Submit after all required work is complete" },
  ];
  await Promise.all(automaticStates.map((state) => ctx.admin.from("mission_checklist_items").update({
    completed: state.completed,
    completed_at: state.completed ? now : null,
    notes: state.notes,
  }).eq("assignment_id", assignmentId).eq("item_key", state.key)));

  const [{ data: items, error: itemsError }] = await Promise.all([
    ctx.admin.from("mission_checklist_items").select("*").eq("assignment_id", assignmentId).order("sort_order"),
  ]);
  if (itemsError) return NextResponse.json({ error: "Field workflow could not be loaded." }, { status: 500 });

  const blockers: string[] = [];
  const cautions: string[] = [];
  if (!insurance.verified) blockers.push("Mission insurance is not verified");
  if (!ctx.contractor.part107_verified) blockers.push("Part 107 verification is not current");
  if (!ctx.assignment.assigned_uav) blockers.push("A compatible UAV has not been assigned");
  if (!ctx.assignment.job.scheduled_for) cautions.push("Mission performance date is not scheduled");
  const requiredIncomplete = (items ?? []).filter((item) => item.required && !item.completed && item.item_key !== "mission_submitted");
  if (requiredIncomplete.length) cautions.push(`${requiredIncomplete.length} required workflow item${requiredIncomplete.length === 1 ? " is" : "s are"} incomplete`);
  const submissionBlockers = [
    ...blockers,
    ...(!ctx.assignment.job.completed_at ? ["Mark field capture complete"] : []),
    ...missingDeliverables.map((item) => `Upload ${item.label}`),
    ...requiredIncomplete.map((item) => item.label),
  ];
  return NextResponse.json({
    items: items ?? [], job: ctx.assignment.job, assignmentStatus: ctx.assignment.status, insurance,
    deliverablePlan: deliverablePlanFor(ctx.assignment.job.service_type).map((item) => ({
      ...item,
      uploaded: (deliverables ?? []).some((deliverable) => deliverable.type === item.type),
    })),
    readiness: {
      level: blockers.length ? "no_go" : cautions.length ? "caution" : "go",
      blockers, cautions,
      requiredIncomplete: requiredIncomplete.map((item) => ({ id: item.id, label: item.label, phase: item.phase })),
    },
    submission: {
      ready: submissionBlockers.length === 0,
      blockers: [...new Set(submissionBlockers)],
      submitted,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await context(req, assignmentId);
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const insurance = coverage(ctx);
  if (!insurance.verified && body.action !== "incident") {
    return NextResponse.json({ error: "Verified insurance is mandatory. Upload a current COI in Pilot Profile or ask DOM to bind approved gig coverage before continuing." }, { status: 409 });
  }
  const flightActions = ["check_in", "start_flight", "field_complete", "submit_for_qc"];
  if (flightActions.includes(body.action) && !ctx.contractor.part107_verified) return NextResponse.json({ error: "Part 107 verification is required before field operations." }, { status: 409 });
  if (flightActions.includes(body.action) && !ctx.assignment.assigned_uav) return NextResponse.json({ error: "Assign a compatible UAV before field operations." }, { status: 409 });

  const now = new Date().toISOString();
  if (body.action === "checklist") {
    const { data: item } = await ctx.admin.from("mission_checklist_items").select("item_key")
      .eq("id", body.itemId).eq("assignment_id", assignmentId).maybeSingle();
    if (!item) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
    if (["insurance_verified", "deliverables_uploaded", "mission_submitted"].includes(item.item_key)) return NextResponse.json({ error: "This item updates automatically." }, { status: 409 });
    const { error } = await ctx.admin.from("mission_checklist_items").update({ completed: !!body.completed, completed_at: body.completed ? now : null })
      .eq("id", body.itemId).eq("assignment_id", assignmentId);
    if (error) return NextResponse.json({ error: "Checklist item could not be updated." }, { status: 500 });
  } else if (["check_in", "start_flight", "field_complete"].includes(body.action)) {
    const column = body.action === "check_in" ? "checked_in_at" : body.action === "start_flight" ? "started_at" : "completed_at";
    const { error } = await ctx.admin.from("jobs").update({ [column]: now }).eq("id", ctx.assignment.job_id);
    if (error) return NextResponse.json({ error: "Mission timing could not be updated." }, { status: 500 });
    if (body.action === "start_flight") {
      await Promise.all([
        ctx.admin.from("mission_assignments").update({ status: "in_progress" }).eq("id", assignmentId).in("status", ["accepted", "scheduled"]),
        ctx.admin.from("mission_requests").update({ status: "in_progress" }).eq("id", ctx.assignment.job.mission_request_id).in("status", ["assigned", "scheduled"]),
        ctx.admin.from("jobs").update({ status: "in_progress" }).eq("id", ctx.assignment.job_id).in("status", ["scheduled"]),
      ]);
    }
    await ctx.admin.from("mission_activity_events").insert({
      mission_request_id: ctx.assignment.job.mission_request_id, job_id: ctx.assignment.job_id,
      assignment_id: assignmentId, actor_user_id: ctx.user.id, actor_role: "pilot", visibility: "shared",
      event_type: body.action,
      summary: body.action === "check_in" ? "Pilot checked in on site" : body.action === "start_flight" ? "Flight operations started" : "Field capture completed",
    });
  } else if (body.action === "submit_for_qc") {
    if (["submitted", "qc_passed", "paid"].includes(ctx.assignment.status)) return NextResponse.json({ ok: true });
    const [{ data: submittedDeliverables }, { data: incomplete }] = await Promise.all([
      ctx.admin.from("deliverables").select("type").eq("job_id", ctx.assignment.job_id),
      ctx.admin.from("mission_checklist_items").select("label").eq("assignment_id", assignmentId).eq("required", true).eq("completed", false).neq("item_key", "mission_submitted"),
    ]);
    const blockers = [
      ...(!ctx.assignment.job.completed_at ? ["Mark field capture complete"] : []),
      ...missingRequiredDeliverables(ctx.assignment.job.service_type, (submittedDeliverables ?? []).map((item) => item.type)).map((item) => `Upload ${item.label}`),
      ...(incomplete ?? []).map((item) => item.label),
    ];
    if (blockers.length) return NextResponse.json({ error: "Complete the remaining steps before QC submission.", blockers: [...new Set(blockers)] }, { status: 409 });
    const { error } = await ctx.admin.rpc("pilot_submit_mission_for_qc", { p_assignment_id: assignmentId, p_actor_user_id: ctx.user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  } else if (body.action === "incident") {
    if (typeof body.summary !== "string" || !body.summary.trim()) return NextResponse.json({ error: "Incident summary required" }, { status: 400 });
    const { error } = await ctx.admin.from("mission_incidents").insert({
      assignment_id: assignmentId, severity: body.severity ?? "observation", occurred_at: now,
      summary: body.summary.trim().slice(0, 500), details: String(body.details ?? "").trim().slice(0, 5000),
      operations_paused: !!body.operationsPaused, reported_by: ctx.user.id,
    });
    if (error) return NextResponse.json({ error: "Safety report could not be submitted." }, { status: 500 });
  } else return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
