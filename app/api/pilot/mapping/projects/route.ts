import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { MAPPING_ELIGIBLE_ASSIGNMENT_STATUSES } from "@/lib/mapperPipeline";

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

// POST /api/pilot/mapping/projects  { job_id?, name, location_snapshot?, latitude?, longitude? }
// contractor_id is NEVER taken from the request body — only from the
// resolved, verified auth context. Linked mission projects require a confirmed
// assignment; independent imported-flight projects belong to this contractor.
export async function POST(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
    return NextResponse.json({ error: "A project name (up to 200 characters) is required." }, { status: 400 });
  }
  if (body.job_id != null && (typeof body.job_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.job_id))) {
    return NextResponse.json({ error: "Invalid mission ID." }, { status: 400 });
  }
  const location = typeof body.location_snapshot === "string" ? body.location_snapshot.trim().slice(0, 500) : "";
  const suppliedLatitude = typeof body.latitude === "number" ? body.latitude : null;
  const suppliedLongitude = typeof body.longitude === "number" ? body.longitude : null;
  if ((suppliedLatitude === null) !== (suppliedLongitude === null) ||
      (suppliedLatitude !== null && (!Number.isFinite(suppliedLatitude) || Math.abs(suppliedLatitude) > 90)) ||
      (suppliedLongitude !== null && (!Number.isFinite(suppliedLongitude) || Math.abs(suppliedLongitude) > 180))) {
    return NextResponse.json({ error: "Provide a valid latitude and longitude together." }, { status: 400 });
  }
  if (!body.job_id && !location && suppliedLatitude === null) {
    return NextResponse.json({ error: "Add a location or coordinates for an imported flight." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let jobLocation: string | null = null;
  let missionRequestId: string | null = null;
  if (body.job_id) {
    // Existing DOM-assigned missions remain restricted to an actual confirmed assignment.
    const { data: assignment, error: assignmentError } = await admin
      .from("mission_assignments")
      .select("id, job:jobs(id, location, mission_request_id)")
      .eq("contractor_id", auth.contractor.id)
      .eq("job_id", body.job_id)
      .in("status", MAPPING_ELIGIBLE_ASSIGNMENT_STATUSES)
      .maybeSingle();
    if (assignmentError) return NextResponse.json({ error: "Unable to verify mission assignment." }, { status: 500 });
    if (!assignment) {
      return NextResponse.json({ error: "You don't have a confirmed assignment on this job." }, { status: 403 });
    }
    const job = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
    jobLocation = job?.location ?? null;
    missionRequestId = job?.mission_request_id ?? null;
  }

  let latitude = suppliedLatitude;
  let longitude = suppliedLongitude;
  if ((latitude === null || longitude === null) && missionRequestId) {
    const { data: mr } = await admin
      .from("mission_requests")
      .select("latitude, longitude")
      .eq("id", missionRequestId)
      .maybeSingle();
    latitude = latitude ?? mr?.latitude ?? null;
    longitude = longitude ?? mr?.longitude ?? null;
  }

  const { data: project, error } = await admin
    .from("mapping_projects")
    .insert({
      job_id: body.job_id || null,
      contractor_id: auth.contractor.id,
      name: body.name.trim(),
      location_snapshot: location || jobLocation || null,
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
