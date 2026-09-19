import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const [leads, notes, contacts, locations, relationships, activities, nextActions, smartleadStatuses] = await Promise.all([
    admin.from("leads").select("*").order("created_at", { ascending: false }),
    admin.from("notes").select("*").eq("entity_type", "lead").order("created_at", { ascending: false }),
    admin.from("lead_contacts").select("*").order("is_primary", { ascending: false }),
    admin.from("lead_locations").select("*").order("created_at", { ascending: true }),
    admin.from("lead_relationships").select("*").order("created_at", { ascending: true }),
    admin.from("lead_activities").select("*").order("occurred_at", { ascending: false }),
    admin.from("lead_next_actions").select("*").order("due_at", { ascending: true }),
    admin.from("lead_smartlead_status").select("*"),
  ]);

  const failed = [leads, notes, contacts, locations, relationships, activities, nextActions, smartleadStatuses]
    .find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: `CRM files could not be loaded: ${failed.error.message}` }, { status: 500 });
  }

  const prospectIds = (leads.data ?? [])
    .map((lead) => lead.external_prospect_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const outreachEvents = prospectIds.length
    ? await admin.from("outreach_events")
      .select("id, prospect_id, event_type, intent, created_at")
      .in("prospect_id", prospectIds)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (outreachEvents.error) {
    return NextResponse.json({ error: `CRM activity could not be loaded: ${outreachEvents.error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    leads: leads.data ?? [],
    notes: notes.data ?? [],
    contacts: contacts.data ?? [],
    locations: locations.data ?? [],
    relationships: relationships.data ?? [],
    activities: activities.data ?? [],
    nextActions: nextActions.data ?? [],
    smartleadStatuses: smartleadStatuses.data ?? [],
    outreachEvents: outreachEvents.data ?? [],
  });
}
