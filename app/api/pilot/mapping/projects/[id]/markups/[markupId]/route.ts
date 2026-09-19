import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; markupId: string }> }) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, markupId } = await params;
  const admin = getSupabaseAdmin();
  const { data: project } = await admin
    .from("mapping_projects")
    .select("id")
    .eq("id", id)
    .eq("contractor_id", auth.contractor.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: created } = await admin
    .from("mapping_events")
    .select("id")
    .eq("mapping_project_id", id)
    .eq("event_type", "dominic_markup_created")
    .contains("metadata", { markup_id: markupId })
    .maybeSingle();
  if (!created) return NextResponse.json({ error: "Markup not found." }, { status: 404 });

  const { error } = await admin.from("mapping_events").insert({
    mapping_project_id: id,
    actor_type: "pilot",
    actor_id: auth.contractor.id,
    event_type: "dominic_markup_deleted",
    message: "DOMINIC markup removed.",
    metadata: { markup_id: markupId },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
