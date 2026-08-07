import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// GET /api/pilot/mapping/jobs-eligible
// Jobs this contractor can attach a new mapping project to — same trust
// boundary as deliverables (an accepted assignment on the job).
export async function GET(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const { data: assignments, error } = await admin
    .from("mission_assignments")
    .select("job:jobs(id, title, service_type, location, scheduled_for, status)")
    .eq("contractor_id", auth.contractor.id)
    .eq("status", "accepted");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = (assignments ?? [])
    .map((a) => (Array.isArray(a.job) ? a.job[0] : a.job))
    .filter((j): j is NonNullable<typeof j> => !!j);

  return NextResponse.json({ jobs });
}
