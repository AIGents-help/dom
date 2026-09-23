import { NextRequest, NextResponse } from "next/server";
import { resolveContractor } from "@/lib/pilotAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type FlightEventInput = {
  atMs?: number;
  phase: string;
  message: string;
  checkpointId?: string;
  aircraftState?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
};

type ObservationInput = {
  id?: string;
  checkpointId?: string;
  capturedAtMs: number;
  latitude?: number;
  longitude?: number;
  relativeAltitudeFt?: number;
  cameraAngle?: number;
  sharpnessScore?: number;
  exposureScore?: number;
  usable?: boolean;
  imageReference?: string;
  metadata?: Record<string, unknown>;
};

async function ownedRun(
  admin: ReturnType<typeof getSupabaseAdmin>,
  runId: string,
  contractorId: string,
) {
  const { data } = await admin
    .from("dominic_flight_runs")
    .select("id,status")
    .eq("id", runId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

  const { data, error } = await admin
    .from("dominic_flight_runs")
    .select("id,mission_type,status,aircraft_vendor,aircraft_model,aircraft_id,coverage_summary,started_at,completed_at,aborted_at,failure_message,created_at")
    .eq("contractor_id", auth.contractor.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body?.missionType || typeof body.missionType !== "string") {
    return NextResponse.json({ error: "missionType is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("dominic_flight_runs")
    .insert({
      contractor_id: auth.contractor.id,
      mission_request_id: body.missionRequestId ?? null,
      mapping_project_id: body.mappingProjectId ?? null,
      mission_type: body.missionType,
      status: body.status ?? "started",
      aircraft_vendor: body.aircraft?.vendor ?? null,
      aircraft_model: body.aircraft?.model ?? null,
      aircraft_id: body.aircraft?.aircraftId ?? null,
      bridge_id: body.aircraft?.bridgeId ?? null,
      plan: body.plan ?? {},
      calibration: body.calibration ?? {},
      capability_snapshot: body.capabilities ?? {},
      coverage_summary: body.coverageSummary ?? {},
      started_at: body.startedAtMs ? new Date(body.startedAtMs).toISOString() : new Date().toISOString(),
    })
    .select("id,status,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body?.runId || typeof body.runId !== "string") {
    return NextResponse.json({ error: "runId is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const run = await ownedRun(admin, body.runId, auth.contractor.id);
  if (!run) return NextResponse.json({ error: "Flight run not found." }, { status: 404 });

  const events = Array.isArray(body.events) ? (body.events as FlightEventInput[]) : [];
  if (events.length) {
    const rows = events.slice(0, 1000).map((event) => ({
      flight_run_id: body.runId,
      contractor_id: auth.contractor.id,
      event_at: event.atMs ? new Date(event.atMs).toISOString() : new Date().toISOString(),
      phase: String(event.phase ?? "UNKNOWN"),
      message: String(event.message ?? ""),
      checkpoint_id: event.checkpointId ?? null,
      aircraft_state: event.aircraftState ?? null,
      details: event.details ?? {},
    }));
    const { error } = await admin.from("dominic_flight_events").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const observations = Array.isArray(body.observations)
    ? (body.observations as ObservationInput[])
    : [];
  if (observations.length) {
    const rows = observations.slice(0, 2000).map((observation) => ({
      flight_run_id: body.runId,
      contractor_id: auth.contractor.id,
      checkpoint_id: observation.checkpointId ?? null,
      captured_at: new Date(observation.capturedAtMs).toISOString(),
      latitude: observation.latitude ?? null,
      longitude: observation.longitude ?? null,
      relative_altitude_ft: observation.relativeAltitudeFt ?? null,
      camera_angle_deg: observation.cameraAngle ?? null,
      sharpness_score: observation.sharpnessScore ?? null,
      exposure_score: observation.exposureScore ?? null,
      usable: observation.usable ?? null,
      image_reference: observation.imageReference ?? null,
      metadata: { ...(observation.metadata ?? {}), clientObservationId: observation.id ?? null },
    }));
    const { error } = await admin.from("dominic_capture_observations").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === "string") update.status = body.status;
  if (body.coverageSummary) update.coverage_summary = body.coverageSummary;
  if (body.failureMessage !== undefined) update.failure_message = body.failureMessage || null;
  if (body.completedAtMs) update.completed_at = new Date(body.completedAtMs).toISOString();
  if (body.abortedAtMs) update.aborted_at = new Date(body.abortedAtMs).toISOString();

  const { data, error } = await admin
    .from("dominic_flight_runs")
    .update(update)
    .eq("id", body.runId)
    .eq("contractor_id", auth.contractor.id)
    .select("id,status,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data, eventsRecorded: events.length, observationsRecorded: observations.length });
}
