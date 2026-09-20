import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PIPELINE = ["requested", "reviewing", "scoped", "quoted", "approved", "assigned", "scheduled", "in_progress", "delivered", "closed"] as const;
const DELIVERABLE_TYPES = new Set(["orthomosaic", "3d_model", "dsm", "dtm", "point_cloud", "processing_report", "report", "raw_images", "video", "other"]);

async function requireAdmin(req: NextRequest) {
  if (!(await isAdminRequest(req))) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  return data.user ? { admin, user: data.user } : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const action = typeof body.action === "string" ? body.action : "";
  const { data: mission } = await auth.admin.from("mission_requests").select("id,status").eq("id", id).maybeSingle();
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  const { data: job } = await auth.admin.from("jobs").select("id,status,delivery_responsibility").eq("mission_request_id", id).maybeSingle();

  if (action === "advance_status") {
    const index = PIPELINE.indexOf(mission.status as (typeof PIPELINE)[number]);
    if (index < 0 || index === PIPELINE.length - 1) return NextResponse.json({ error: "This mission cannot advance from its current status" }, { status: 409 });
    const nextStatus = PIPELINE[index + 1];
    const { data, error } = await auth.admin.from("mission_requests").update({ status: nextStatus })
      .eq("id", id).eq("status", mission.status).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "Mission status could not be updated" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Mission status changed; reload and try again" }, { status: 409 });
    return NextResponse.json({ ok: true, nextStatus });
  }

  if (!job) return NextResponse.json({ error: "Mission job not found" }, { status: 404 });

  if (action === "bind_gig_insurance") {
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 200) : "";
    const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : new Date(NaN);
    if (!assignmentId || !reference || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Policy reference and future expiration are required" }, { status: 400 });
    }
    const { data: assignment } = await auth.admin.from("mission_assignments")
      .select("id,contractor:contractors(dom_gig_insurance_eligible)").eq("id", assignmentId).eq("job_id", job.id).maybeSingle();
    const contractor = Array.isArray(assignment?.contractor) ? assignment.contractor[0] : assignment?.contractor;
    if (!assignment) return NextResponse.json({ error: "Mission assignment not found" }, { status: 404 });
    if (!contractor?.dom_gig_insurance_eligible) return NextResponse.json({ error: "Pilot is not eligible for DOM gig insurance" }, { status: 409 });
    const { error } = await auth.admin.from("mission_assignments").update({
      insurance_source: "dom_gig", mission_insurance_verified: true,
      mission_insurance_reference: reference, mission_insurance_expires_at: expiresAt.toISOString(),
    }).eq("id", assignment.id);
    if (error) return NextResponse.json({ error: "Gig coverage could not be bound" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_deliverable_qc") {
    const deliverableId = typeof body.deliverableId === "string" ? body.deliverableId : "";
    const passed = body.passed === true;
    const { data: deliverable } = await auth.admin.from("deliverables")
      .select("id,supersedes_deliverable_id")
      .eq("id", deliverableId).eq("job_id", job.id).maybeSingle();
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found for this mission" }, { status: 404 });

    const deliveredAt = passed ? new Date().toISOString() : null;
    const { error } = await auth.admin.from("deliverables").update({
      qc_passed: passed, delivered_at: deliveredAt,
    }).eq("id", deliverable.id);
    if (error) return NextResponse.json({ error: "Deliverable QC could not be updated" }, { status: 500 });

    // A corrected DOMINIC output does not replace the client-requested revision
    // until the correction itself passes DOM QC. This keeps the prior version
    // active and auditable throughout processing and quality review.
    if (passed && deliverable.supersedes_deliverable_id) {
      const { error: supersedeError } = await auth.admin.from("deliverables")
        .update({ client_status: "superseded" })
        .eq("id", deliverable.supersedes_deliverable_id)
        .eq("job_id", job.id)
        .eq("client_status", "revision_requested");
      if (supersedeError) {
        await auth.admin.from("deliverables").update({ qc_passed: false, delivered_at: null }).eq("id", deliverable.id);
        return NextResponse.json({ error: "Corrected deliverable could not complete its revision handoff" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "register_deliverable") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const type = typeof body.type === "string" && DELIVERABLE_TYPES.has(body.type) ? body.type : "";
    const storageUrl = typeof body.storageUrl === "string" ? body.storageUrl : "";
    if (!name || !type || !storageUrl.startsWith(`${job.id}/`) || storageUrl.includes("..")) {
      return NextResponse.json({ error: "Invalid deliverable record" }, { status: 400 });
    }
    const { error } = await auth.admin.from("deliverables").insert({ job_id: job.id, name, type, storage_url: storageUrl });
    if (error) return NextResponse.json({ error: "Deliverable could not be registered" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_delivery_responsibility") {
    const value = body.value === "admin" || body.value === "pilot" ? body.value : null;
    if (!value) return NextResponse.json({ error: "Invalid delivery responsibility" }, { status: 400 });
    const { error } = await auth.admin.from("jobs").update({ delivery_responsibility: value }).eq("id", job.id);
    if (error) return NextResponse.json({ error: "Delivery responsibility could not be updated" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
