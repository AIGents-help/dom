import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";
import { MEASUREMENT_TYPES, computeMeasurementValue, isValidMeasurementGeometry, type MeasurementType, type MeasurementGeometry, type MeasurementCrs } from "@/lib/measurementPipeline";

const VALID_TYPES: Set<string> = new Set(MEASUREMENT_TYPES.map((t) => t.value));

// GET  /api/pilot/mapping/projects/[id]/measurements — list, newest first.
// POST /api/pilot/mapping/projects/[id]/measurements — draw+save. The
// value/unit are always computed server-side from the submitted geometry
// (lib/measurementPipeline.ts) rather than trusted from the browser, so a
// saved measurement's number can never be tampered with or drift from what
// the geometry actually represents.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data: project } = await admin.from("mapping_projects").select("id").eq("id", id).eq("contractor_id", auth.contractor.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: measurements, error } = await admin
    .from("mapping_measurements")
    .select("id, measurement_type, label, value, unit, geometry, created_at, updated_at")
    .eq("mapping_project_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ measurements: measurements ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data: project } = await admin.from("mapping_projects").select("id").eq("id", id).eq("contractor_id", auth.contractor.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const measurementType: string = body.measurement_type;
  const geometry: MeasurementGeometry = body.geometry;
  const label: string | null = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  // Which coordinate system the submitted geometry is in (the viewer reads
  // this straight off the source GeoTIFF's own georeferencing — see
  // OrthomosaicViewer.tsx's isGeographicBbox). The server can't
  // independently verify the source CRS without re-parsing the GeoTIFF
  // itself, so this one input is trusted from the client; the geometry's
  // raw coordinates and the resulting value are still always computed
  // here, never accepted as a submitted number.
  const crs: MeasurementCrs = body.crs === "projected" ? "projected" : "geographic";

  if (!VALID_TYPES.has(measurementType)) return NextResponse.json({ error: "Invalid measurement_type." }, { status: 400 });
  if (!geometry || !isValidMeasurementGeometry(measurementType as MeasurementType, geometry)) {
    return NextResponse.json({ error: "Invalid geometry for this measurement type." }, { status: 400 });
  }

  const value = computeMeasurementValue(measurementType as MeasurementType, geometry, crs);
  const unit = MEASUREMENT_TYPES.find((t) => t.value === measurementType)!.unit;

  const { data: measurement, error } = await admin
    .from("mapping_measurements")
    .insert({
      mapping_project_id: id,
      contractor_id: auth.contractor.id,
      measurement_type: measurementType,
      label,
      value,
      unit,
      geometry,
    })
    .select("id, measurement_type, label, value, unit, geometry, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ measurement }, { status: 201 });
}
