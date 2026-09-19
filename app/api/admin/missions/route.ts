import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from("mission_requests")
    .select("id,requester_name,company,service_type,location,status,quoted_amount_cents,created_at,jobs(id,status,scheduled_for,delivery_responsibility,assignments(id,status,assigned_uav,mission_insurance_verified,mission_checklist_items(required,completed)),deliverables(id,qc_passed,delivered_at))")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ missions: data ?? [] });
}
