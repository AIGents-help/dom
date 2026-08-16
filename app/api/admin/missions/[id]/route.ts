import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest } from "@/lib/authz";

async function requireAdmin(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const admin = getSupabaseAdmin();
    const allowedStatuses = ["requested", "reviewing", "scoped", "quoted", "approved", "assigned", "scheduled", "in_progress", "delivered", "closed", "cancelled"];
    const { data: currentMission } = await admin.from("mission_requests").select("client_id,client_profile_sync_enabled").eq("id",id).maybeSingle();
    if(!currentMission)return NextResponse.json({error:"Mission not found"},{status:404});

    if (body.status && !allowedStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid mission status" }, { status: 400 });
    }

    const syncEnabled=typeof body.clientProfileSyncEnabled==="boolean"?body.clientProfileSyncEnabled:currentMission.client_profile_sync_enabled;
    let requesterName=body.requesterName?.trim()||null,requesterEmail=body.requesterEmail?.trim()||null,company=body.company?.trim()||null;
    if(syncEnabled&&currentMission.client_id){const{data:client}=await admin.from("clients").select("contact_name,email,company_name").eq("id",currentMission.client_id).maybeSingle();if(client){requesterName=client.contact_name;requesterEmail=client.email;company=client.company_name}}
    const missionPatch = {
      requester_name: requesterName,
      requester_email: requesterEmail,
      company,
      client_profile_sync_enabled:!!currentMission.client_id&&syncEnabled,
      service_type: body.serviceType?.trim() || null,
      location: body.location?.trim() || null,
      scope: body.scope?.trim() || null,
      status: body.status,
      quoted_amount_cents: Number.isFinite(body.quotedAmountCents) ? body.quotedAmountCents : null,
    };

    const { error: missionError } = await admin.from("mission_requests").update(missionPatch).eq("id", id);
    if (missionError) throw missionError;

    const { data: job } = await admin.from("jobs").select("id").eq("mission_request_id", id).maybeSingle();
    if (job) {
      const jobPatch: Record<string, unknown> = {
        title: body.title?.trim() || body.serviceType?.replace(/_/g, " ") || "Mission",
        service_type: body.serviceType?.trim() || null,
        location: body.location?.trim() || null,
        scheduled_for: body.scheduledFor || null,
      };
      if (body.status === "cancelled") jobPatch.status = "cancelled";
      const { error: jobError } = await admin.from("jobs").update(jobPatch).eq("id", job.id);
      if (jobError) throw jobError;

      if (body.status === "cancelled") {
        const { error: assignmentError } = await admin
          .from("mission_assignments")
          .update({ status: "cancelled" })
          .eq("job_id", job.id)
          .not("status", "in", "(paid,qc_passed)");
        if (assignmentError) throw assignmentError;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Could not update mission" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data: job } = await admin.from("jobs").select("id").eq("mission_request_id", id).maybeSingle();

    if (job) {
      const { data: assignments } = await admin.from("mission_assignments").select("id, status").eq("job_id", job.id);
      const assignmentIds = (assignments ?? []).map((a) => a.id);
      if ((assignments ?? []).some((a) => ["qc_passed", "paid"].includes(a.status))) {
        return NextResponse.json({ error: "Completed or paid missions must be cancelled and retained, not deleted." }, { status: 409 });
      }

      if (assignmentIds.length) {
        const { data: protectedPayments } = await admin
          .from("payments")
          .select("id")
          .in("assignment_id", assignmentIds)
          .not("status", "in", "(failed,refunded)")
          .limit(1);
        if (protectedPayments?.length) {
          return NextResponse.json({ error: "This mission has an active payment record and cannot be permanently deleted." }, { status: 409 });
        }
      }

      const { data: completedDeliverables } = await admin
        .from("deliverables")
        .select("id")
        .eq("job_id", job.id)
        .or("qc_passed.eq.true,delivered_at.not.is.null")
        .limit(1);
      if (completedDeliverables?.length) {
        return NextResponse.json({ error: "This mission has completed deliverables and must be retained." }, { status: 409 });
      }

      if (assignmentIds.length) {
        await admin.from("payments").delete().in("assignment_id", assignmentIds).in("status", ["failed", "refunded"]);
      }
      const { error: deliverableError } = await admin.from("deliverables").delete().eq("job_id", job.id);
      if (deliverableError) throw deliverableError;
      const { error: assignmentError } = await admin.from("mission_assignments").delete().eq("job_id", job.id);
      if (assignmentError) throw assignmentError;
      const { error: jobError } = await admin.from("jobs").delete().eq("id", job.id);
      if (jobError) throw jobError;
    }

    for (const table of ["mission_documents", "mission_contacts", "mission_expenses", "mission_permissions", "quotes"] as const) {
      const { error } = await admin.from(table).delete().eq("mission_request_id", id);
      if (error) throw error;
    }
    const { error: missionError } = await admin.from("mission_requests").delete().eq("id", id);
    if (missionError) throw missionError;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Could not delete mission" }, { status: 500 });
  }
}
