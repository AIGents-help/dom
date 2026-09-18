import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { assessMissionEquipment } from "@/lib/missionEquipmentGuidance";
import { sendNotification } from "@/lib/resend/client";
import { missionAvailable } from "@/lib/resend/templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(req: NextRequest, assignmentId: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const auth = getSupabaseAnonServer(authHeader);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors").select("id,full_name").eq("user_id", user.id).maybeSingle();
  if (!contractor) return null;
  const { data: assignment } = await admin.from("mission_assignments")
    .select("id,job_id,contractor_id,assignment_role,status,mission_price_cents,contractor_payout_cents,job:jobs(id,title,service_type,location,delivery_responsibility,mission_request:mission_requests(id,created_by_contractor_id))")
    .eq("id", assignmentId).eq("contractor_id", contractor.id).maybeSingle();
  if (!assignment) return null;
  const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
  const mission = Array.isArray(job?.mission_request) ? job.mission_request[0] : job?.mission_request;
  if (!job || !mission) return null;
  return { admin, user, contractor, assignment, job, mission };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await context(req, assignmentId);
  if (!ctx) return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  const owner = ctx.mission.created_by_contractor_id === ctx.contractor.id && ctx.assignment.assignment_role === "owner";
  const { data: fieldAssignments } = await ctx.admin.from("mission_assignments")
    .select("id,contractor_id,status,offered_at,accepted_at,submitted_at,contractor_payout_cents,contractor:contractors(full_name,email,service_area)")
    .eq("job_id", ctx.job.id).eq("assignment_role", "field").order("created_at", { ascending: false });
  const current = (fieldAssignments ?? []).find((item) => !["declined", "cancelled"].includes(item.status)) ?? null;

  let eligiblePilots: Array<Record<string, unknown>> = [];
  if (owner && !current) {
    const excluded = new Set((fieldAssignments ?? []).map((item) => item.contractor_id));
    excluded.add(ctx.contractor.id);
    const { data: contractors } = await ctx.admin.from("contractors")
      .select("id,full_name,email,service_area,equipment,part107_verified,insurance_verified,status")
      .eq("status", "active").eq("part107_verified", true).eq("insurance_verified", true);
    eligiblePilots = (contractors ?? []).filter((pilot) => !excluded.has(pilot.id)).map((pilot) => {
      const equipment = assessMissionEquipment(ctx.job.service_type, pilot.equipment);
      return {
        id: pilot.id, fullName: pilot.full_name, email: pilot.email, serviceArea: pilot.service_area,
        equipmentFit: equipment.some((item) => item.compatible),
      };
    }).sort((a, b) => Number(b.equipmentFit) - Number(a.equipmentFit));
  }

  return NextResponse.json({
    viewerRole: owner ? "owner" : "field_pilot",
    ownerName: owner ? ctx.contractor.full_name : null,
    missionTitle: ctx.job.title,
    missionPriceCents: ctx.assignment.mission_price_cents,
    currentAssignment: current ? {
      id: current.id,
      status: current.status,
      payoutCents: current.contractor_payout_cents,
      pilot: Array.isArray(current.contractor) ? current.contractor[0] : current.contractor,
    } : null,
    eligiblePilots,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const ctx = await context(req, assignmentId);
  if (!ctx) return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (ctx.mission.created_by_contractor_id !== ctx.contractor.id || ctx.assignment.assignment_role !== "owner") {
    return NextResponse.json({ error: "Only the pilot mission owner can manage the field assignment" }, { status: 403 });
  }

  if (body.action === "approve") {
    const { error } = await ctx.admin.rpc("pilot_owner_approve_team_mission", {
      p_owner_assignment_id: assignmentId,
      p_actor_user_id: ctx.user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const contractorId = typeof body.contractorId === "string" ? body.contractorId : "";
  const payoutCents = Number(body.payoutCents);
  if (body.action !== "offer" || !UUID.test(contractorId) || !Number.isInteger(payoutCents) || payoutCents < 0) {
    return NextResponse.json({ error: "Select a pilot and enter a valid whole-dollar payout" }, { status: 400 });
  }
  const { data: fieldAssignmentId, error } = await ctx.admin.rpc("pilot_owner_offer_team_assignment", {
    p_owner_assignment_id: assignmentId,
    p_actor_user_id: ctx.user.id,
    p_contractor_id: contractorId,
    p_payout_cents: payoutCents,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: /already|active/i.test(error.message) ? 409 : 400 });

  let notificationWarning: string | null = null;
  try {
    const { data: pilot } = await ctx.admin.from("contractors").select("full_name,email").eq("id", contractorId).single();
    if (pilot?.email) {
      const template = missionAvailable({
        pilotName: pilot.full_name,
        missionTitle: ctx.job.title,
        serviceType: ctx.job.service_type,
        location: ctx.job.location ?? "Location TBD",
        payoutCents,
      });
      const result = await sendNotification({
        to: pilot.email, emailType: "mission_available", recipientType: "pilot", recipientEntityId: contractorId,
        missionRequestId: ctx.mission.id, jobId: ctx.job.id, assignmentId: fieldAssignmentId,
        subject: template.subject, html: template.html, idempotencyKey: `pilot-team-offer/${fieldAssignmentId}`,
      });
      if (!result.success) notificationWarning = "Offer saved, but the invitation email could not be sent.";
    } else notificationWarning = "Offer saved, but this pilot has no email address.";
  } catch (notificationError) {
    console.error("pilot team offer email failed", notificationError);
    notificationWarning = "Offer saved, but the invitation email could not be sent.";
  }
  return NextResponse.json({ ok: true, assignmentId: fieldAssignmentId, notificationWarning });
}
