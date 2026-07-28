import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/webhooks/smartlead
// Receives event_sent / email_open / email_click / email_reply / lead_unsubscribed
// from Smartlead's webhook system. Every event is logged to outreach_events.
// On a reply, we classify intent from the payload and — if interested —
// upsert a prospect record and drop a row into `leads` so it shows up in the
// existing Admin Dashboard Leads tab with zero new UI required.
//
// Configure this URL + a shared secret in Smartlead's Campaign > Webhooks
// settings. Smartlead sends the secret back as a custom header we chose
//
mkdir -p app/api/webhooks/smartlead
cat > app/api/webhooks/smartlead/route.ts << 'EOF'
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/webhooks/smartlead
// Receives event_sent / email_open / email_click / email_reply / lead_unsubscribed
// from Smartlead's webhook system. Every event is logged to outreach_events.
// On a reply, we classify intent from the payload and — if interested —
// upsert a prospect record and drop a row into `leads` so it shows up in the
// existing Admin Dashboard Leads tab with zero new UI required.
//
// Configure this URL + a shared secret in Smartlead's Campaign > Webhooks
// settings. Smartlead sends the secret back as a custom header we chose
// when setting up the webhook — verify it matches SMARTLEAD_WEBHOOK_SECRET.

const WEBHOOK_SECRET = process.env.SMARTLEAD_WEBHOOK_SECRET;

type SmartleadPayload = {
  event_type: "EMAIL_SENT" | "EMAIL_OPEN" | "EMAIL_CLICK" | "EMAIL_REPLY" | "LEAD_UNSUBSCRIBED" | "EMAIL_BOUNCE";
  campaign_id?: string | number;
  campaign_name?: string;
  lead_email: string;
  lead_first_name?: string;
  lead_last_name?: string;
  lead_company?: string;
  lead_phone?: string;
  reply_body?: string;
  [key: string]: unknown;
};

const EVENT_MAP: Record<SmartleadPayload["event_type"], string> = {
  EMAIL_SENT: "sent",
  EMAIL_OPEN: "opened",
  EMAIL_CLICK: "clicked",
  EMAIL_REPLY: "replied",
  LEAD_UNSUBSCRIBED: "unsubscribed",
  EMAIL_BOUNCE: "bounced",
};

// Naive first-pass reply classifier. Replace with a real LLM/keyword
// classifier once reply volume justifies it — for now this just keeps
// obvious "not interested" / OOO replies out of the Leads tab.
function classifyIntent(body: string | undefined): "interested" | "not_interested" | "ooo" | "unknown" {
  if (!body) return "unknown";
  const text = body.toLowerCase();
  if (/(out of office|ooo|on vacation|automatic reply)/.test(text)) return "ooo";
  if (/(not interested|remove me|unsubscribe|stop emailing|no thanks)/.test(text)) return "not_interested";
  if (/(interested|tell me more|sounds good|call me|let's talk|set up a call|schedule)/.test(text)) return "interested";
  return "unknown";
}

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const providedSecret = req.headers.get("x-webhook-secret");
  if (providedSecret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const payload = (await req.json()) as SmartleadPayload;
  const supabaseAdmin = getSupabaseAdmin();

  if (!payload.lead_email || !payload.event_type) {
    return NextResponse.json({ error: "missing lead_email or event_type" }, { status: 400 });
  }

  const { data: existingProspect } = await supabaseAdmin
    .from("prospects")
    .select("id, status")
    .eq("email", payload.lead_email)
    .maybeSingle();

  let prospectId = existingProspect?.id as string | undefined;

  if (!prospectId) {
    const { data: newProspect, error: insertError } = await supabaseAdmin
      .from("prospects")
      .insert({
        company_name: payload.lead_company ?? "Unknown",
        contact_name: [payload.lead_first_name, payload.lead_last_name].filter(Boolean).join(" ") || null,
        email: payload.lead_email,
        phone: payload.lead_phone ?? null,
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
        await supabaseAdmin.from("leads").insert({
          name: [payload.lead_first_name, payload.lead_last_nac

mkdir -p app/api/webhooks/smartlead
cat > app/api/webhooks/smartlead/route.ts << 'EOF'
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/webhooks/smartlead
// Receives event_sent / email_open / email_click / email_reply / lead_unsubscribed
// from Smartlead's webhook system. Every event is logged to outreach_events.
// On a reply, we classify intent from the payload and — if interested —
// upsert a prospect record and drop a row into `leads` so it shows up in the
// existing Admin Dashboard Leads tab with zero new UI required.
//
// Configure this URL + a shared secret in Smartlead's Campaign > Webhooks
// settings. Smartlead sends the secret back as a custom header we chose
// when setting up the webhook — verify it matches SMARTLEAD_WEBHOOK_SECRET.

const WEBHOOK_SECRET = process.env.SMARTLEAD_WEBHOOK_SECRET;

type SmartleadPayload = {
  event_type: "EMAIL_SENT" | "EMAIL_OPEN" | "EMAIL_CLICK" | "EMAIL_REPLY" | "LEAD_UNSUBSCRIBED" | "EMAIL_BOUNCE";
  campaign_id?: string | number;
  campaign_name?: string;
  lead_email: string;
  lead_first_name?: string;
  lead_last_name?: string;
  lead_company?: string;
  lead_phone?: string;
  reply_body?: string;
  [key: string]: unknown;
};

const EVENT_MAP: Record<SmartleadPayload["event_type"], string> = {
  EMAIL_SENT: "sent",
  EMAIL_OPEN: "opened",
  EMAIL_CLICK: "clicked",
  EMAIL_REPLY: "replied",
  LEAD_UNSUBSCRIBED: "unsubscribed",
  EMAIL_BOUNCE: "bounced",
};

// Naive first-pass reply classifier. Replace with a real LLM/keyword
// classifier once reply volume justifies it — for now this just keeps
// obvious "not interested" / OOO replies out of the Leads tab.
function classifyIntent(body: string | undefined): "interested" | "not_interested" | "ooo" | "unknown" {
  if (!body) return "unknown";
  const text = body.toLowerCase();
  if (/(out of office|ooo|on vacation|automatic reply)/.test(text)) return "ooo";
  if (/(not interested|remove me|unsubscribe|stop emailing|no thanks)/.test(text)) return "not_interested";
  if (/(interested|tell me more|sounds good|call me|let's talk|set up a call|schedule)/.test(text)) return "interested";
  return "unknown";
}

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const providedSecret = req.headers.get("x-webhook-secret");
  if (providedSecret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const payload = (await req.json()) as SmartleadPayload;
  const supabaseAdmin = getSupabaseAdmin();

  if (!payload.lead_email || !payload.event_type) {
    return NextResponse.json({ error: "missing lead_email or event_type" }, { status: 400 });
  }

  const { data: existingProspect } = await supabaseAdmin
    .from("prospects")
    .select("id, status")
    .eq("email", payload.lead_email)
    .maybeSingle();

  let prospectId = existingProspect?.id as string | undefined;

  if (!prospectId) {
    const { data: newProspect, error: insertError } = await supabaseAdmin
      .from("prospects")
      .insert({
        company_name: payload.lead_company ?? "Unknown",
        contact_name: [payload.lead_first_name, payload.lead_last_name].filter(Boolean).join(" ") || null,
        email: payload.lead_email,
        phone: payload.lead_phone ?? null,
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
        await supabaseAdmin.from("leads").insert({
          name: [payload.lead_first_name, payload.lead_last_name].filter(Boolean).join(" ") || null,
          email: payload.lead_email,
          company: payload.lead_company ?? null,
          phone: payload.lead_phone ?? null,
          source: "cold_email",
          message: payload.reply_body ?? null,
          status: "new",
          external_prospect_id: prospectId,
        });
      }
    }
  }

  if (payload.event_type === "LEAD_UNSUBSCRIBED") {
    await supabaseAdmin.from("prospects").update({ status: "dead" }).eq("id", prospectId);
  }

  return NextResponse.json({ ok: true });
}
