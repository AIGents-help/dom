import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// GET /api/pilot/mapping/projects — list this contractor's mapping projects.
export async function GET(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const { data: projects, error } = await admin
    .from("mapping_projects")
    .select("*, job:jobs(id, title, location)")
    .eq("contractor_id", auth.contractor.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: projects ?? [] });
}

// POST /api/pilot/mapping/projects  { job_id, name, location_snapshot?, latitude?, longitude? }
// contractor_id is NEVER taken from the request body — only from the
// resolved, verified auth context. Creating a project also requires the
// contractor to actually have an accepted assignment on the target job.
export async function POST(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body?.job_id || !body?.name?.trim()) {
    return NextResponse.json({ error: "job_id and name are required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: assignment } = await admin
    .from("mission_assignments")
    .select("id, job:jobs(id, location, mission_request_id)")
    .eq("contractor_id", auth.contractor.id)
    .eq("job_id", body.job_id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "You don't have an accepted assignment on this job." }, { status: 403 });
  }

  const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;

  let latitude: number | null = typeof body.latitude === "number" ? body.latitude : null;
  let longitude: number | null = typeof body.longitude === "number" ? body.longitude : null;
  if ((latitude === null || longitude === null) && job?.mission_request_id) {
    const { data: mr } = await admin
      .from("mission_requests")
      .select("latitude, longitude")
      .eq("id", job.mission_request_id)
      .maybeSingle();
    latitude = latitude ?? mr?.latitude ?? null;
    longitude = longitude ?? mr?.longitude ?? null;
  }

  const { data: project, error } = await admin
    .from("mapping_projects")
    .insert({
      job_id: body.job_id,
      contractor_id: auth.contractor.id,
      name: body.name.trim(),
      location_snapshot: body.location_snapshot?.trim() || job?.location || null,
      latitude,
      longitude,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("mapping_events").insert({
    mapping_project_id: project.id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "project_created",
    message: `Project "${project.name}" created.`,
  });

  return NextResponse.json({ project });
}
