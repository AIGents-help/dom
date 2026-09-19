import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from("mission_requests")
    .select("id,requester_name,company,service_type,location,status,quoted_amount_cents,created_at,created_by_contractor_id,requires_admin_approval,jobs(id,status,scheduled_for,delivery_responsibility,assignments(id,status,assigned_uav,mission_insurance_verified,mission_checklist_items(required,completed)),deliverables(id,qc_passed,delivered_at))")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const creatorIds = [...new Set((data ?? []).map((mission) => mission.created_by_contractor_id).filter((id): id is string => !!id))];
  const { data: creators, error: creatorError } = creatorIds.length
    ? await getSupabaseAdmin().from("contractors").select("id,full_name").in("id", creatorIds)
    : { data: [], error: null };
  if (creatorError) return NextResponse.json({ error: creatorError.message }, { status: 500 });
  const creatorNames = new Map((creators ?? []).map((creator) => [creator.id, creator.full_name]));
  const missions = (data ?? []).map((mission) => ({
    ...mission,
    created_by_pilot_name: mission.created_by_contractor_id ? creatorNames.get(mission.created_by_contractor_id) ?? "Pilot" : null,
  }));
  return NextResponse.json({ missions }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
