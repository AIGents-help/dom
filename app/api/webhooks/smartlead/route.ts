import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AUTO_TRANSITION_LOCKED_STATUSES } from "@/lib/leadsPipeline";
import {
  type SmartleadEventType,
  EVENT_TO_OUTREACH_STATUS,
  mapEventToStatusTransition,
  mapCategoryToEffect,
  classifyIntent,
  isDuplicateKeyError,
} from "@/lib/smartleadMapping";

const SIGNING_SECRET = process.env.SMARTLEAD_WEBHOOK_SECRET;

type SmartleadPayload = {
  event_type: SmartleadEventType;
  campaign_id?: number;
  campaign_name?: string;
  to_email?: string;
  to_name?: string;
  reply_body?: string;
  lead_email?: string;
  lead_name?: string;
  sequence_number?: number;
  // The exact field name Smartlead uses for the new category on
  // LEAD_CATEGORY_UPDATED isn't fully documented in what's publicly
  // available — check the plausible variants defensively rather than
  // asserting one and silently dropping the event if it's wrong.
  category?: string;
  lead_category?: string;
  new_category?: string;
  [key: string]: unknown;
};

// Original event_type -> outreach_events.event_type mapping, unchanged from
// the first version of this route (kept separate from
// EVENT_TO_OUTREACH_STATUS in lib/smartleadMapping.ts, which describes the
// new lead_smartlead_status.outreach_status vocabulary instead).
const EVENT_MAP: Partial<Record<SmartleadEventType, string>> = {
  EMAIL_SENT: "sent",
  FIRST_EMAIL_SENT: "sent",
  EMAIL_OPEN: "opened",
  EMAIL_LINK_CLICK: "clicked",
  EMAIL_REPLY: "replied",
  LEAD_UNSUBSCRIBED: "unsubscribed",
  EMAIL_BOUNCE: "bounced",
};

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!SIGNING_SECRET || !signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", SIGNING_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readCategory(payload: SmartleadPayload): string | null {
  return payload.category ?? payload.lead_category ?? payload.new_category ?? null;
}

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

// Upserts lead_smartlead_status for a matched lead. Reads the existing row
// first and writes back merged values (same pragmatic select-then-write
// pattern the rest of this route already uses for `prospects` — not
// perfectly atomic under two concurrent deliveries for the SAME lead, but
// consistent with existing convention and low-risk at this webhook's volume).
async function upsertLeadSmartleadStatus(
  supabaseAdmin: SupabaseAdminClient,
  leadId: string,
  patch: {
    campaign_name?: string | null;
    sequence_step?: number | null;
    outreach_status?: string;
    last_sent_at?: string;
    last_opened_at?: string;
    last_clicked_at?: string;
    last_replied_at?: string;
    reply_category?: string | null;
    bounce_status?: string | null;
    unsubscribed_at?: string;
    incrementOpen?: boolean;
    incrementClick?: boolean;
  }
) {
  const { data: existing } = await supabaseAdmin
    .from("lead_smartlead_status")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  const row = {
    lead_id: leadId,
    campaign_name: patch.campaign_name ?? existing?.campaign_name ?? null,
    sequence_step: patch.sequence_step ?? existing?.sequence_step ?? null,
    outreach_status: patch.outreach_status ?? existing?.outreach_status ?? null,
    last_sent_at: patch.last_sent_at ?? existing?.last_sent_at ?? null,
    last_opened_at: patch.last_opened_at ?? existing?.last_opened_at ?? null,
    last_clicked_at: patch.last_clicked_at ?? existing?.last_clicked_at ?? null,
    last_replied_at: patch.last_replied_at ?? existing?.last_replied_at ?? null,
    reply_category: patch.reply_category ?? existing?.reply_category ?? null,
    bounce_status: patch.bounce_status ?? existing?.bounce_status ?? null,
    unsubscribed_at: patch.unsubscribed_at ?? existing?.unsubscribed_at ?? null,
    open_count: (existing?.open_count ?? 0) + (patch.incrementOpen ? 1 : 0),
    click_count: (existing?.click_count ?? 0) + (patch.incrementClick ? 1 : 0),
    last_synced_at: new Date().toISOString(),
  };

  await supabaseAdmin.from("lead_smartlead_status").upsert(row, { onConflict: "lead_id" });
}

async function handleWebhook(req: NextRequest): Promise<NextResponse> {
  if (!SIGNING_SECRET) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-smartlead-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as SmartleadPayload;
  const supabaseAdmin = getSupabaseAdmin();

  const email = payload.to_email ?? payload.lead_email;
  const name = payload.to_name ?? payload.lead_name;

  if (!email || !payload.event_type) {
    return NextResponse.json({ error: "missing email or event_type" }, { status: 400 });
  }

  // Idempotency: every real Smartlead delivery includes an X-Request-Id
  // header meant for exactly this purpose (per their docs). Insert the
  // ledger row BEFORE any other write — a 23505 conflict means this exact
  // delivery was already fully processed, so bail out immediately rather
  // than re-running any mutation. A missing header (shouldn't happen, but
  // don't trust it) falls through and processes normally instead of
  // rejecting a real event over an absent header.
  const requestId = req.headers.get("x-request-id");
  if (requestId) {
    const { error: dedupeError } = await supabaseAdmin
      .from("smartlead_webhook_events")
      .insert({ request_id: requestId, event_type: payload.event_type, lead_email: email });
    if (dedupeError) {
      if (isDuplicateKeyError(dedupeError)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      console.error("Smartlead webhook: failed to record idempotency ledger:", dedupeError.message);
    }
  }

  const { data: existingProspect } = await supabaseAdmin
    .from("prospects")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  let prospectId = existingProspect?.id as string | undefined;

  if (!prospectId) {
    const { data: newProspect, error: insertError } = await supabaseAdmin
      .from("prospects")
      .insert({
        company_name: payload.campaign_name ?? "Unknown",
        contact_name: name ?? null,
        email,
        source: "smartlead",
        status: "sent",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to create prospect:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    prospectId = newProspect.id;
  }

  const intent = payload.event_type === "EMAIL_REPLY" ? classifyIntent(payload.reply_body) : null;

  await supabaseAdmin.from("outreach_events").insert({
    prospect_id: prospectId,
    event_type: EVENT_MAP[payload.event_type] ?? payload.event_type.toLowerCase(),
    intent,
    raw_payload: payload,
  });

  if (payload.event_type === "EMAIL_REPLY") {
    await supabaseAdmin
      .from("prospects")
      .update({ status: intent === "interested" ? "warm" : intent === "not_interested" ? "dead" : "replied" })
      .eq("id", prospectId);

    if (intent === "interested") {
      const { data: alreadyLead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("external_prospect_id", prospectId)
        .maybeSingle();

      if (!alreadyLead) {
        const cleanReply = payload.reply_body?.replace(/<[^>]*>/g, " ").trim() ?? null;
        await supabaseAdmin.from("leads").insert({
          name: name ?? null,
          email,
          company: null,
          source: "cold_email",
          message: cleanReply,
          status: "contacted",
          external_prospect_id: prospectId,
        });
      }
    }
  }

  if (payload.event_type === "LEAD_UNSUBSCRIBED") {
    await supabaseAdmin.from("prospects").update({ status: "dead" }).eq("id", prospectId);
  }

  // --- DOM-side lead matching & pipeline sync (additive; everything above
  // this point is the original, untouched inbound-webhook behavior) ---------
  // Matched by email rather than external_prospect_id, since an
  // outbound-enrolled lead (added to a campaign FROM DOM) is a known `leads`
  // row from the start — it doesn't need the reply-creates-a-lead path above
  // to exist at all.
  const { data: matchedLead } = await supabaseAdmin
    .from("leads")
    .select("id, status")
    .ilike("email", email)
    .maybeSingle();

  if (matchedLead) {
    const nowIso = new Date().toISOString();
    const statusPatch: Record<string, unknown> = {};

    switch (payload.event_type) {
      case "EMAIL_SENT":
      case "FIRST_EMAIL_SENT":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          campaign_name: payload.campaign_name ?? null,
          sequence_step: payload.sequence_number ?? null,
          outreach_status: EVENT_TO_OUTREACH_STATUS[payload.event_type],
          last_sent_at: nowIso,
        });
        break;
      case "EMAIL_OPEN":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          outreach_status: EVENT_TO_OUTREACH_STATUS.EMAIL_OPEN,
          last_opened_at: nowIso,
          incrementOpen: true,
        });
        break;
      case "EMAIL_LINK_CLICK":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          outreach_status: EVENT_TO_OUTREACH_STATUS.EMAIL_LINK_CLICK,
          last_clicked_at: nowIso,
          incrementClick: true,
        });
        break;
      case "EMAIL_REPLY":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          outreach_status: EVENT_TO_OUTREACH_STATUS.EMAIL_REPLY,
          last_replied_at: nowIso,
        });
        break;
      case "EMAIL_BOUNCE":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          outreach_status: EVENT_TO_OUTREACH_STATUS.EMAIL_BOUNCE,
          bounce_status: "bounced",
        });
        break;
      case "LEAD_UNSUBSCRIBED":
        await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, {
          outreach_status: EVENT_TO_OUTREACH_STATUS.LEAD_UNSUBSCRIBED,
          unsubscribed_at: nowIso,
        });
        break;
      case "LEAD_CATEGORY_UPDATED": {
        const category = readCategory(payload);
        if (category) {
          await upsertLeadSmartleadStatus(supabaseAdmin, matchedLead.id, { reply_category: category });
          const effect = mapCategoryToEffect(category);
          if (effect.status && (effect.permanent || !AUTO_TRANSITION_LOCKED_STATUSES.includes(matchedLead.status))) {
            statusPatch.status = effect.status;
          }
          if (effect.followUp) {
            const dueAt = new Date(Date.now() + effect.followUp.dueInDays * 24 * 60 * 60 * 1000).toISOString();
            await supabaseAdmin.from("lead_next_actions").insert({
              lead_id: matchedLead.id,
              action_type: effect.followUp.actionType,
              due_at: dueAt,
              status: "open",
              notes: `Auto-created from Smartlead reply category: ${category}`,
            });
          }
        } else {
          console.error("Smartlead webhook: LEAD_CATEGORY_UPDATED with no recognizable category field on payload");
        }
        break;
      }
      default:
        break;
    }

    // Forward-only status transition for plain delivery/unsubscribe events
    // (reply-category effects above already computed their own statusPatch).
    if (!("status" in statusPatch)) {
      const transition = mapEventToStatusTransition(matchedLead.status, payload.event_type);
      if (transition) statusPatch.status = transition;
    }

    if ("status" in statusPatch) {
      await supabaseAdmin.from("leads").update(statusPatch).eq("id", matchedLead.id);
      await supabaseAdmin.from("lead_activities").insert({
        lead_id: matchedLead.id,
        activity_type: "status_change",
        summary: `Status changed to "${statusPatch.status}" (Smartlead ${payload.event_type})`,
        created_by: "smartlead-webhook",
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    return await handleWebhook(req);
  } catch (err) {
    console.error("Smartlead webhook error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
