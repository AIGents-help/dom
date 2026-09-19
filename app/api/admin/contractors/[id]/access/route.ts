import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type VerificationField = "part107_verified" | "insurance_verified" | "dom_gig_insurance_eligible";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin.from("contractors").select("id,insurance_coi_path,insurance_policy_number,insurance_expires_on").eq("id", id).maybeSingle();
  if (!contractor) return NextResponse.json({ error: "Pilot not found" }, { status: 404 });

  if (action === "set_uninsured_eligibility") {
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (typeof body?.enabled !== "boolean" || reason.length < 10) {
      return NextResponse.json({ error: "An Admin reason of at least 10 characters is required." }, { status: 400 });
    }
    const authorization = req.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Admin session expired" }, { status: 401 });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Admin session expired" }, { status: 401 });
    const { error } = await admin.rpc("admin_set_uninsured_self_service_eligibility", {
      p_contractor_id: id,
      p_actor_user_id: user.id,
      p_enabled: body.enabled,
      p_reason: reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  let patch: Record<string, unknown>;
  if (action === "set_verification") {
    const field = body?.field as VerificationField;
    const value = body?.value === true;
    if (!["part107_verified", "insurance_verified", "dom_gig_insurance_eligible"].includes(field)) {
      return NextResponse.json({ error: "Invalid verification field" }, { status: 400 });
    }
    if (field === "insurance_verified" && value) {
      const current = contractor.insurance_expires_on
        && new Date(`${contractor.insurance_expires_on}T23:59:59Z`).getTime() > Date.now();
      if (!contractor.insurance_coi_path || !contractor.insurance_policy_number || !current) {
        return NextResponse.json({ error: "A current policy number, future expiration date, and uploaded COI are required." }, { status: 409 });
      }
    }
    patch = field === "insurance_verified" && value
      ? { [field]: true, insurance_requested: false }
      : field === "insurance_verified"
        ? { [field]: false, insurance_verification_basis: null, insurance_verification_note: null, insurance_verified_by: null, insurance_verified_at: null }
        : { [field]: value };
  } else if (action === "activate") {
    patch = { status: "active" };
  } else if (action === "unlock_resources") {
    patch = { resource_access_locked: false };
  } else if (action === "approve_self_service") {
    patch = { can_create_missions: true };
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { error } = await admin.from("contractors").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Pilot access could not be updated" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
