import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SIGNING_SECRET = process.env.SMARTLEAD_WEBHOOK_SECRET;

type SmartleadEventType =
  | "EMAIL_SENT"
  | "FIRST_EMAIL_SENT"
  | "EMAIL_OPEN"
  | "EMAIL_LINK_CLICK"
  | "EMAIL_REPLY"
  | "EMAIL_BOUNCE"
  | "LEAD_UNSUBSCRIBED"
  | "LEAD_CATEGORY_UPDATED";

type SmartleadPayload = {
  event_type: SmartleadEventType;
  campaign_id?: number;
  campaign_name?: string;
  to_email?: string;
  to_name?: string;
  reply_body?: string;
  lead_email?: string;
  lead_name?: string;
  [key: string]: unknown;
};

const EVENT_MAP: Partial<Record<SmartleadEventType, string>> = {
  EMAIL_SENT: "sent",
  FIRST_EMAIL_SENT: "sent",
  EMAIL_OPEN: "opened",
  EMAIL_LINK_CLICK: "clicked",
  EMAIL_REPLY: "replied",
  LEAD_UNSUBSCRIBED: "unsubscribed",
  EMAIL_BOUNCE: "bounced",
};

function classifyIntent(body: string | undefined): "interested" | "not_interested" | "ooo" | "unknown" {
  if (!body) return "unknown";
  const text = body.replace(/<[^>]*>/g, " ").toLowerCase();
  if (/(out of office|ooo|on vacation|automatic reply)/.test(text)) return "ooo";
  if (/(not interested|remove me|unsubscribe|stop emailing|no thanks)/.test(text)) return "not_interested";
  if (/(interested|tell me more|sounds good|call me|let's talk|set up a call|schedule)/.test(text)) return "interested";
  return "unknown";
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!SIGNING_SECRET || !signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", SIGNING_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
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

  return NextResponse.json({ ok: true });
}
