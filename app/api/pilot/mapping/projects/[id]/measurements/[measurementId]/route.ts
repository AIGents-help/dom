import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

// PATCH  — rename only (label). Geometry/value are immutable once saved —
//          redraw-and-save-new is the intended way to change a measurement,
//          keeping every measurement's value provably tied to its geometry.
// DELETE — remove.
async function loadOwnedMeasurement(admin: ReturnType<typeof getSupabaseAdmin>, id: string, measurementId: string, contractorId: string) {
  const { data: project } = await admin.from("mapping_projects").select("id").eq("id", id).eq("contractor_id", contractorId).maybeSingle();
  if (!project) return null;
  const { data: measurement } = await admin.from("mapping_measurements").select("id").eq("id", measurementId).eq("mapping_project_id", id).maybeSingle();
  return measurement;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; measurementId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, measurementId } = await params;
  const admin = getSupabaseAdmin();
  const existing = await loadOwnedMeasurement(admin, id, measurementId, auth.contractor.id);
  if (!existing) return NextResponse.json({ error: "Measurement not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() || null : undefined;
  if (label === undefined) return NextResponse.json({ error: "label is required." }, { status: 400 });

  const { data: measurement, error } = await admin
    .from("mapping_measurements")
    .update({ label })
    .eq("id", measurementId)
    .select("id, measurement_type, label, value, unit, geometry, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ measurement });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; measurementId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, measurementId } = await params;
  const admin = getSupabaseAdmin();
  const existing = await loadOwnedMeasurement(admin, id, measurementId, auth.contractor.id);
  if (!existing) return NextResponse.json({ error: "Measurement not found." }, { status: 404 });

  const { error } = await admin.from("mapping_measurements").delete().eq("id", measurementId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
