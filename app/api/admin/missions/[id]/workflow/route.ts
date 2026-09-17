import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AUTOMATIC_WORKFLOW_KEYS,
  deliverablePlanFor,
  missingRequiredDeliverables,
  PROTECTED_WORKFLOW_KEYS,
  WORKFLOW_ITEMS,
  type WorkflowItemKey,
} from "@/lib/missionWorkflow";

const AUTOMATIC_KEYS = new Set<string>(AUTOMATIC_WORKFLOW_KEYS);

interface AdminContractor {
  id: string;
  full_name: string;
  part107_verified: boolean;
  insurance_verified: boolean;
  insurance_provider: string | null;
  insurance_expires_on: string | null;
}

interface AdminAssignment {
  id: string;
  status: string;
  assigned_uav: string | null;
  insurance_source: string | null;
  mission_insurance_verified: boolean;
  mission_insurance_expires_at: string | null;
  contractor_id: string;
  contractor: AdminContractor | AdminContractor[] | null;
}

async function requireAdmin(req: NextRequest) {
  if (!(await isAdminRequest(req))) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  return data.user ? { admin, user: data.user } : null;
}

function insuranceCoverage(assignment: AdminAssignment, contractor: Partial<AdminContractor>) {
  const profileCurrent = contractor.insurance_verified && !!contractor.insurance_expires_on
    && new Date(`${contractor.insurance_expires_on}T23:59:59`).getTime() > Date.now();
  const gigCurrent = assignment.insurance_source === "dom_gig" && assignment.mission_insurance_verified
    && (!assignment.mission_insurance_expires_at || new Date(assignment.mission_insurance_expires_at).getTime() > Date.now());
  return {
    verified: profileCurrent || gigCurrent,
    source: gigCurrent ? "DOM-provided gig policy" : profileCurrent ? `${contractor.insurance_provider ?? "Pilot"} policy` : null,
  };
}

async function loadMission(admin: ReturnType<typeof getSupabaseAdmin>, missionId: string) {
  const { data: job, error: jobError } = await admin.from("jobs")
    .select("id,mission_request_id,service_type,scheduled_for,checked_in_at,started_at,completed_at,status")
    .eq("mission_request_id", missionId).maybeSingle();
  if (jobError || !job) return null;

  const [{ data: assignments, error: assignmentError }, { data: deliverables, error: deliverableError }] = await Promise.all([
    admin.from("mission_assignments")
      .select("id,status,assigned_uav,insurance_source,mission_insurance_verified,mission_insurance_expires_at,contractor_id,contractor:contractors(id,full_name,part107_verified,insurance_verified,insurance_provider,insurance_expires_on)")
      .eq("job_id", job.id).not("status", "in", "(declined,cancelled)").order("offered_at", { ascending: false }),
    admin.from("deliverables").select("id,type,name,qc_passed").eq("job_id", job.id),
  ]);
  if (assignmentError || deliverableError) throw assignmentError ?? deliverableError;
  return { job, assignments: (assignments ?? []) as unknown as AdminAssignment[], deliverables: deliverables ?? [] };
}

async function syncAssignment(
  admin: ReturnType<typeof getSupabaseAdmin>,
  mission: NonNullable<Awaited<ReturnType<typeof loadMission>>>,
  assignment: AdminAssignment,
) {
  const contractor = Array.isArray(assignment.contractor) ? assignment.contractor[0] : assignment.contractor;
  await admin.from("mission_checklist_items").upsert(
    WORKFLOW_ITEMS.map(([phase, key, label], index) => ({ assignment_id: assignment.id, phase, item_key: key, label, sort_order: index })),
    { onConflict: "assignment_id,phase,item_key", ignoreDuplicates: true },
  );
  const insurance = insuranceCoverage(assignment, contractor ?? {});
  const submitted = ["submitted", "qc_passed", "paid"].includes(assignment.status);
  const missingDeliverables = missingRequiredDeliverables(mission.job.service_type, mission.deliverables.map((item) => item.type));
  const deliverablesComplete = missingDeliverables.length === 0;
  const now = new Date().toISOString();
  const automaticStates = [
    { key: "uav_assigned", completed: !!assignment.assigned_uav, notes: assignment.assigned_uav ? `Assigned aircraft: ${assignment.assigned_uav}` : "Assign a compatible UAV" },
    { key: "insurance_verified", completed: insurance.verified, notes: insurance.verified ? `${insurance.source} verified` : "Insurance verification required" },
    { key: "capture_complete", completed: !!mission.job.completed_at, notes: mission.job.completed_at ? "Field capture marked complete" : "Complete the approved capture plan" },
    { key: "deliverables_uploaded", completed: deliverablesComplete, notes: deliverablesComplete ? "Every required deliverable category is uploaded" : `Still required: ${missingDeliverables.map((item) => item.label).join(", ")}` },
    { key: "mission_submitted", completed: submitted, notes: submitted ? "Submitted to DOM for QC" : "Submit after all required work is complete" },
  ];
  await Promise.all(automaticStates.map((state) => admin.from("mission_checklist_items").update({
    completed: state.completed,
    completed_at: state.completed ? now : null,
    notes: state.notes,
  }).eq("assignment_id", assignment.id).eq("item_key", state.key)));
  return { contractor, insurance, submitted };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  try {
    const mission = await loadMission(auth.admin, id);
    if (!mission) return NextResponse.json({ error: "Mission job not found" }, { status: 404 });
    const rows = [];
    for (const assignment of mission.assignments) {
      const state = await syncAssignment(auth.admin, mission, assignment);
      const { data: items, error } = await auth.admin.from("mission_checklist_items")
        .select("id,phase,item_key,label,required,completed,completed_at,notes,sort_order")
        .eq("assignment_id", assignment.id).order("sort_order");
      if (error) throw error;
      const incomplete = (items ?? []).filter((item) => item.required && !item.completed && item.item_key !== "mission_submitted");
      const missingDeliverables = missingRequiredDeliverables(mission.job.service_type, mission.deliverables.map((item) => item.type));
      const blockers = [
        ...(!state.contractor?.part107_verified ? ["Part 107 verification is not current"] : []),
        ...(!state.insurance.verified ? ["Mission insurance is not verified"] : []),
        ...(!assignment.assigned_uav ? ["A compatible UAV has not been assigned"] : []),
        ...(!mission.job.completed_at ? ["Mark field capture complete"] : []),
        ...missingDeliverables.map((item) => `Upload ${item.label}`),
        ...incomplete.map((item) => item.label),
      ];
      rows.push({
        id: assignment.id,
        status: assignment.status,
        pilotName: state.contractor?.full_name ?? "Assigned pilot",
        part107Verified: !!state.contractor?.part107_verified,
        insurance: state.insurance,
        assignedUav: assignment.assigned_uav,
        items: (items ?? []).map((item) => ({
          ...item,
          automatic: AUTOMATIC_KEYS.has(item.item_key),
          protected: PROTECTED_WORKFLOW_KEYS.has(item.item_key as WorkflowItemKey),
        })),
        submission: { ready: blockers.length === 0, blockers: [...new Set(blockers)], submitted: state.submitted },
      });
    }
    return NextResponse.json({
      job: mission.job,
      deliverablePlan: deliverablePlanFor(mission.job.service_type).map((item) => ({
        ...item,
        uploaded: mission.deliverables.some((deliverable) => deliverable.type === item.type),
      })),
      assignments: rows,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow could not be loaded" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string" || typeof body.assignmentId !== "string") {
    return NextResponse.json({ error: "Invalid workflow action" }, { status: 400 });
  }
  try {
    const mission = await loadMission(auth.admin, id);
    if (!mission) return NextResponse.json({ error: "Mission job not found" }, { status: 404 });
    const assignment = mission.assignments.find((row) => row.id === body.assignmentId);
    if (!assignment) return NextResponse.json({ error: "Active assignment not found" }, { status: 404 });
    const state = await syncAssignment(auth.admin, mission, assignment);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

    if (["complete", "waive", "reopen"].includes(body.action)) {
      if (typeof body.itemId !== "string") return NextResponse.json({ error: "Checklist item required" }, { status: 400 });
      const { data: item } = await auth.admin.from("mission_checklist_items").select("id,item_key,label")
        .eq("id", body.itemId).eq("assignment_id", assignment.id).maybeSingle();
      if (!item) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
      if (AUTOMATIC_KEYS.has(item.item_key) || PROTECTED_WORKFLOW_KEYS.has(item.item_key as WorkflowItemKey)) {
        return NextResponse.json({ error: "This requirement is controlled by verified mission data and cannot be manually bypassed." }, { status: 409 });
      }
      if (reason.length < 5) {
        return NextResponse.json({ error: "Enter a brief reason for this Admin action." }, { status: 400 });
      }
      const { error } = await auth.admin.rpc("admin_set_mission_checklist_item", {
        p_assignment_id: assignment.id,
        p_item_id: item.id,
        p_actor_user_id: auth.user.id,
        p_action: body.action,
        p_reason: reason,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "submit_for_qc") {
      const { data: items } = await auth.admin.from("mission_checklist_items").select("label,item_key,required,completed")
        .eq("assignment_id", assignment.id).eq("required", true).eq("completed", false).neq("item_key", "mission_submitted");
      const missingDeliverables = missingRequiredDeliverables(mission.job.service_type, mission.deliverables.map((item) => item.type));
      const blockers = [
        ...(!state.contractor?.part107_verified ? ["Part 107 verification is not current"] : []),
        ...(!state.insurance.verified ? ["Mission insurance is not verified"] : []),
        ...(!assignment.assigned_uav ? ["A compatible UAV has not been assigned"] : []),
        ...(!mission.job.completed_at ? ["Mark field capture complete"] : []),
        ...missingDeliverables.map((item) => `Upload ${item.label}`),
        ...(items ?? []).map((item) => item.label),
      ];
      if (blockers.length) return NextResponse.json({ error: "Resolve or waive the remaining requirements before submission.", blockers: [...new Set(blockers)] }, { status: 409 });
      const { error } = await auth.admin.rpc("admin_submit_mission_for_qc", { p_assignment_id: assignment.id, p_actor_user_id: auth.user.id });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid workflow action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow could not be updated" }, { status: 500 });
  }
}
