import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

const MARKUP_TYPES = new Set(["note", "callout", "pin", "cloud", "shape"]);
const POINT_TYPES = new Set(["note", "callout", "pin"]);
const EVENT_TYPES = ["dominic_markup_created", "dominic_markup_deleted"];

function validPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function validGeometry(type: string, geometry: unknown): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (POINT_TYPES.has(type)) return candidate.type === "Point" && validPoint(candidate.coordinates);
  return candidate.type === "Polygon" && Array.isArray(candidate.coordinates) && candidate.coordinates.length >= 3 && candidate.coordinates.every(validPoint);
}

async function ownedProject(projectId: string, contractorId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("mapping_projects")
    .select("id")
    .eq("id", projectId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  return data;
}

// DOMINIC markups are stored as audited mapping_events rather than creating
// a parallel annotation database. This keeps every client-facing markup tied
// to the mapping project timeline and gives us an append-only audit trail.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!(await ownedProject(id, auth.contractor.id))) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const deliverableId = req.nextUrl.searchParams.get("deliverable_id");
  const admin = getSupabaseAdmin();
  const { data: events, error } = await admin
    .from("mapping_events")
    .select("id, event_type, metadata, created_at")
    .eq("mapping_project_id", id)
    .in("event_type", EVENT_TYPES)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const active = new Map<string, Record<string, unknown>>();
  for (const event of events ?? []) {
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
    const markupId = typeof metadata.markup_id === "string" ? metadata.markup_id : null;
    if (!markupId) continue;
    if (event.event_type === "dominic_markup_deleted") {
      active.delete(markupId);
      continue;
    }
    const markup = metadata.markup;
    if (markup && typeof markup === "object") active.set(markupId, markup as Record<string, unknown>);
  }

  const markups = [...active.values()].filter((markup) => !deliverableId || markup.deliverable_id === deliverableId);
  return NextResponse.json({ markups });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!(await ownedProject(id, auth.contractor.id))) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const markupType = typeof body.markup_type === "string" ? body.markup_type : "";
  if (!MARKUP_TYPES.has(markupType)) return NextResponse.json({ error: "Invalid markup type." }, { status: 400 });
  if (!validGeometry(markupType, body.geometry)) return NextResponse.json({ error: "Invalid markup geometry." }, { status: 400 });

  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 500) : null;
  const toolSet = typeof body.tool_set === "string" && body.tool_set.trim() ? body.tool_set.trim().slice(0, 80) : "General";
  const deliverableId = typeof body.deliverable_id === "string" && body.deliverable_id ? body.deliverable_id : null;
  const markupId = randomUUID();
  const createdAt = new Date().toISOString();

  const markup = {
    id: markupId,
    markup_type: markupType,
    label,
    geometry: body.geometry,
    tool_set: toolSet,
    deliverable_id: deliverableId,
    created_at: createdAt,
  };

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("mapping_events").insert({
    mapping_project_id: id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "dominic_markup_created",
    message: label ? `${markupType}: ${label}` : `DOMINIC ${markupType} markup added.`,
    metadata: { markup_id: markupId, markup },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ markup }, { status: 201 });
}
