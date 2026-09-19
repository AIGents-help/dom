import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { sendClientMissionUpdate } from "@/lib/resend/clientMissionUpdates";
import { deliverablePlanFor, missingRequiredDeliverables, missionCompletionMode, WORKFLOW_ITEMS } from "@/lib/missionWorkflow";

interface WorkflowJob {
  mission_request_id: string;
  service_type: string | null;
  scheduled_for: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivery_responsibility: string | null;
  mission_request: { created_by_contractor_id: string | null; requires_admin_approval: boolean } | null;
}
interface WorkflowContext {
  admin: ReturnType<typeof getSupabaseAdmin>;
  user: { id: string };
  assignment: {
    job_id: string; status: string; assignment_role: "owner" | "field"; assigned_uav: string | null;
    insurance_source: string | null; mission_insurance_verified: boolean;
    mission_insurance_reference: string | null; mission_insurance_expires_at: string | null;
    job: WorkflowJob;
  };
  contractor: {
    id: string;
    part107_verified: boolean; insurance_verified: boolean;
    insurance_provider: string | null; insurance_policy_number: string | null;
    insurance_expires_on: string | null; dom_gig_insurance_eligible: boolean;
    uninsured_self_service_eligible: boolean;
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
    .select("id,part107_verified,insurance_verified,insurance_provider,insurance_policy_number,insurance_expires_on,dom_gig_insurance_eligible,uninsured_self_service_eligible")
    .eq("user_id", user.id).maybeSingle();
  if (!contractor) return null;
  const { data: assignment } = await admin.from("mission_assignments")
    .select("job_id,status,assignment_role,assigned_uav,insurance_source,mission_insurance_verified,mission_insurance_reference,mission_insurance_expires_at,job:jobs(mission_request_id,service_type,scheduled_for,checked_in_at,started_at,completed_at,delivery_responsibility,mission_request:mission_requests(created_by_contractor_id,requires_admin_approval))")
    .eq("id", assignmentId).eq("contractor_id", contractor.id).maybeSingle();
  if (!assignment) return null;
  const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
  if (!job) return null;
  const missionRequest = Array.isArray(job.mission_request) ? job.mission_request[0] : job.mission_request;
  return { admin, user, assignment: { ...assignment, job: { ...job, mission_request: missionRequest } } as WorkflowContext["assignment"], contractor };
}

function coverage(ctx: WorkflowContext) {
  const profileCurrent = ctx.contractor.insurance_verified && !!ctx.contractor.insurance_expires_on
    && new Date(`${ctx.contractor.insurance_expires_on}T23:59:59`).getTime() > Date.now();
  const gigCurrent = ctx.assignment.insurance_source === "dom_gig" && ctx.assignment.mission_insurance_verified
    && (!ctx.assignment.mission_insurance_expires_at || new Date(ctx.assignment.mission_insurance_expires_at).getTime() > Date.now());
  const uninsuredAcknowledged = ctx.assignment.insurance_source === "pilot_uninsured_acknowledgement";
  const selfService = ctx.assignment.job.mission_request?.created_by_contractor_id === ctx.contractor.id
    && !ctx.assignment.job.mission_request?.requires_admin_approval;
  return {
    satisfied: profileCurrent || gigCurrent || uninsuredAcknowledged,
    verified: profileCurrent || gigCurrent,
    uninsuredAcknowledged,
    source: gigCurrent ? "DOM-provided gig policy" : profileCurrent ? `${ctx.contractor.insurance_provider ?? "Pilot"} policy` : uninsuredAcknowledged ? "Uninsured — pilot acknowledged responsibility" : null,
    expiresOn: gigCurrent ? ctx.assignment.mission_insurance_expires_at : ctx.contractor.insurance_expires_on,
    reference: gigCurrent ? ctx.assignment.mission_insurance_reference : ctx.contractor.insurance_policy_number,
    gigEligible: ctx.contractor.dom_gig_insurance_eligible,
    selfService,
    uninsuredEligible: selfService && ctx.contractor.uninsured_self_service_eligible,
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
  const completionMode = missionCompletionMode(
    ctx.assignment.job.mission_request?.created_by_contractor_id,
    ctx.contractor.id,
    ctx.assignment.job.delivery_responsibility,
  );
  const submitted = ["submitted", "qc_passed", "paid"].includes(ctx.assignment.status);
  const missingDeliverables = missingRequiredDeliverables(ctx.assignment.job.service_type, (deliverables ?? []).map((item) => item.type));
  const deliverablesComplete = missingDeliverables.length === 0;
  const automaticStates = [
    { key: "uav_assigned", completed: !!ctx.assignment.assigned_uav, notes: ctx.assignment.assigned_uav ? `Assigned aircraft: ${ctx.assignment.assigned_uav}` : "Assign a compatible UAV" },
    { key: "insurance_verified", completed: insurance.satisfied, notes: insurance.satisfied ? `${insurance.source}${insurance.reference ? ` · ${insurance.reference}` : ""}` : "Select an insurance or responsibility path" },
    { key: "capture_complete", completed: !!ctx.assignment.job.completed_at, notes: ctx.assignment.job.completed_at ? "Field capture marked complete" : "Complete the approved capture plan" },
    { key: "deliverables_uploaded", completed: deliverablesComplete, notes: deliverablesComplete ? "Every required deliverable category is uploaded" : `Still required: ${missingDeliverables.map((item) => item.label).join(", ")}` },
    { key: "mission_submitted", completed: submitted, notes: submitted ? (completionMode === "owner_delivery" ? "Certified and delivered by the mission owner" : "Submitted to DOM for QC") : "Complete after all required work is finished" },
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
  if (!insurance.satisfied) blockers.push("Select an insurance or uninsured-responsibility path");
  if (!ctx.contractor.part107_verified) blockers.push("Part 107 verification is not current");
  if (!ctx.assignment.assigned_uav) blockers.push("A compatible UAV has not been assigned");
  if (!ctx.assignment.job.scheduled_for) cautions.push("Mission performance date is not scheduled");
  const requiredIncomplete = (items ?? []).filter((item) => item.required && !item.completed && item.item_key !== "mission_submitted");
  if (requiredIncomplete.length) cautions.push(`${requiredIncomplete.length} required workflow item${requiredIncomplete.length === 1 ? " is" : "s are"} incomplete`);
  const readinessIssues = [
    ...(!insurance.satisfied ? [{ message: "Select an insurance or uninsured-responsibility path", action: "Choose insurance path", target: "mission-insurance" }] : []),
    ...(!ctx.contractor.part107_verified ? [{ message: "Part 107 verification is not current", action: "Open Pilot Profile", target: "pilot-profile" }] : []),
    ...(!ctx.assignment.assigned_uav ? [{ message: "A compatible UAV has not been assigned", action: "Assign aircraft", target: "mission-aircraft" }] : []),
    ...(!ctx.assignment.job.scheduled_for ? [{ message: "Mission performance date is not scheduled", action: "Set performance date", target: "mission-schedule" }] : []),
    ...requiredIncomplete.map((item) => ({
      message: item.label,
      action: "Open checklist item",
      target: `workflow-item-${item.id}`,
    })),
  ];
  const submissionBlockers = [
    ...blockers,
    ...(!ctx.assignment.job.completed_at ? ["Mark field capture complete"] : []),
    ...missingDeliverables.map((item) => `Upload ${item.label}`),
    ...requiredIncomplete.map((item) => item.label),
  ];
  return NextResponse.json({
    items: (items ?? []).map((item) => item.item_key === "mission_submitted" ? {
      ...item,
      label: completionMode === "owner_delivery" ? "Certify and deliver the mission to your client" : completionMode === "owner_review" ? "Submit the mission to its owner for approval" : "Submit mission to DOM for QC",
    } : item),
    job: ctx.assignment.job, assignmentStatus: ctx.assignment.status, insurance,
    ownership: { completionMode, pilotOwned: completionMode !== "dom_qc", ownerIsCurrentPilot: completionMode === "owner_delivery" },
    deliverablePlan: deliverablePlanFor(ctx.assignment.job.service_type).map((item) => ({
      ...item,
      uploaded: (deliverables ?? []).some((deliverable) => deliverable.type === item.type),
    })),
    readiness: {
      level: blockers.length ? "no_go" : cautions.length ? "caution" : "go",
      blockers, cautions,
      requiredIncomplete: requiredIncomplete.map((item) => ({ id: item.id, label: item.label, phase: item.phase })),
      issues: readinessIssues,
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
  if (body.action === "acknowledge_uninsured") {
    if (insurance.verified) return NextResponse.json({ error: "This mission already has verified coverage." }, { status: 409 });
    if (!insurance.uninsuredEligible) return NextResponse.json({ error: insurance.selfService ? "DOM Admin has not authorized your uninsured self-service option." : "DOM-assigned missions require verified insurance coverage." }, { status: 409 });
    if (body.accepted !== true) return NextResponse.json({ error: "You must accept the uninsured responsibility acknowledgement." }, { status: 400 });
    const version = "pilot-uninsured-responsibility-v1";
    const { error } = await ctx.admin.rpc("pilot_acknowledge_uninsured_responsibility", {
      p_assignment_id: assignmentId,
      p_actor_user_id: ctx.user.id,
      p_terms_version: version,
      p_user_agent: req.headers.get("user-agent"),
      p_forwarded_for: req.headers.get("x-forwarded-for"),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (!insurance.satisfied && body.action !== "incident") {
    return NextResponse.json({ error: "Select a valid insurance path or acknowledge uninsured responsibility before continuing." }, { status: 409 });
  }
  const flightActions = ["check_in", "start_flight", "field_complete", "submit_for_qc", "complete_mission"];
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
  } else if (["submit_for_qc", "complete_mission"].includes(body.action)) {
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
    if (blockers.length) return NextResponse.json({ error: "Complete the remaining steps before finishing this mission.", blockers: [...new Set(blockers)] }, { status: 409 });
    const completionMode = missionCompletionMode(
      ctx.assignment.job.mission_request?.created_by_contractor_id,
      ctx.contractor.id,
      ctx.assignment.job.delivery_responsibility,
    );
    if (completionMode === "owner_delivery") {
      const { data: activeFieldAssignment } = await ctx.admin.from("mission_assignments")
        .select("status").eq("job_id", ctx.assignment.job_id).eq("assignment_role", "field")
        .not("status", "in", '("declined","cancelled")').maybeSingle();
      if (activeFieldAssignment) {
        const error = activeFieldAssignment.status === "submitted"
          ? "Review and approve the submitted field-pilot work in the Field Pilot panel."
          : "The field pilot must complete and submit this mission before owner approval.";
        return NextResponse.json({ error }, { status: 409 });
      }
    }
    const rpc = completionMode === "owner_delivery"
      ? "pilot_owner_certify_mission"
      : completionMode === "owner_review"
        ? "pilot_submit_team_mission_for_owner"
        : "pilot_submit_mission_for_qc";
    const { error } = await ctx.admin.rpc(rpc, { p_assignment_id: assignmentId, p_actor_user_id: ctx.user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    if (completionMode === "owner_delivery") {
      try { await sendClientMissionUpdate(assignmentId, { type: "mission_complete" }); }
      catch (emailError) { console.error("pilot-owner client delivery email failed", emailError); }
    }
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
