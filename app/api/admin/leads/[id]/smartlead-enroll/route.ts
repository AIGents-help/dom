import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canEnrollInOutreach, OUTREACH_READY_STATUSES, type Lead, type LeadSmartleadStatus } from "@/lib/leadsPipeline";
import { addLeadsToCampaign, findLeadIdByEmail } from "@/lib/smartlead";

// Real outbound Smartlead enrollment. The inbound webhook
// (app/api/webhooks/smartlead/route.ts) is unrelated and untouched by this
// route. This intentionally still reports "pending configuration" rather
// than pretending anything happened when SMARTLEAD_API_KEY isn't set.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const apiKey = process.env.SMARTLEAD_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Smartlead outbound integration is not configured yet. Set SMARTLEAD_API_KEY to enable enrollment.",
    });
  }

  let campaignId: number | undefined;
  try {
    const body = await req.json();
    campaignId = typeof body?.campaign_id === "number" ? body.campaign_id : undefined;
  } catch {
    // no body — campaignId stays undefined, handled below
  }
  if (!campaignId) {
    return NextResponse.json({ ok: false, configured: true, message: "campaign_id is required." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: lead, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).maybeSingle();
  if (error || !lead) {
    return NextResponse.json({ ok: false, configured: true, message: "Lead not found." }, { status: 404 });
  }

  const { data: smartleadStatus } = await supabaseAdmin
    .from("lead_smartlead_status")
    .select("*")
    .eq("lead_id", id)
    .maybeSingle();

  const guard = canEnrollInOutreach(lead as Lead, (smartleadStatus as LeadSmartleadStatus) ?? null);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, configured: true, message: guard.reason }, { status: 409 });
  }

  const [firstName, ...rest] = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);

  let result;
  try {
    result = await addLeadsToCampaign(campaignId, [
      {
        email: lead.email as string,
        first_name: firstName || undefined,
        last_name: rest.length ? rest.join(" ") : undefined,
        company_name: lead.company ?? undefined,
        phone_number: lead.phone ?? undefined,
        location: lead.address ?? undefined,
      },
    ]);
  } catch (err) {
    console.error("Smartlead enroll error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, configured: true, message: "Smartlead API request failed." }, { status: 502 });
  }

  if (result.added_count < 1) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: result.message || "Smartlead rejected this lead.",
      skipped: result.skipped_leads,
    }, { status: 409 });
  }

  // Enrolled: smartlead_campaign_id is the authoritative "already enrolled"
  // signal (see canEnrollInOutreach) — set it unconditionally now that
  // added_count confirms success. smartlead_lead_id is best-effort only.
  const smartleadLeadId = lead.email ? await findLeadIdByEmail(lead.email as string) : null;

  const statusUpdate: Record<string, unknown> = { smartlead_campaign_id: String(campaignId) };
  if (smartleadLeadId) statusUpdate.smartlead_lead_id = String(smartleadLeadId);
  if (OUTREACH_READY_STATUSES.includes(lead.status)) statusUpdate.status = "outreach_scheduled";

  await supabaseAdmin.from("leads").update(statusUpdate).eq("id", id);

  return NextResponse.json({ ok: true, configured: true, added_count: result.added_count });
}
