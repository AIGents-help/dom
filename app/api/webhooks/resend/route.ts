import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/webhooks/resend
// Resend signs webhook payloads via Svix (svix-id/svix-timestamp/svix-signature
// headers) — same verify-before-trust shape as the Stripe webhook route.
// Every event is recorded to resend_webhook_events for auditability, and
// delivery/open/click/bounce/complaint events update the matching
// notification_log row (matched by resend_message_id).

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    [key: string]: unknown;
  };
}

const STATUS_BY_EVENT: Record<string, { status: string; timestampField?: string }> = {
  "email.sent": { status: "sent" },
  "email.delivered": { status: "delivered", timestampField: "delivered_at" },
  "email.opened": { status: "opened", timestampField: "opened_at" },
  "email.clicked": { status: "clicked", timestampField: "clicked_at" },
  "email.bounced": { status: "bounced" },
  "email.complained": { status: "complained" },
};

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!webhookSecret || !svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const body = await req.text();

  let event: ResendWebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch (e: any) {
    console.error("Resend webhook signature verification failed:", e.message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    await admin.from("resend_webhook_events").insert({
      resend_message_id: event.data.email_id ?? null,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

    const mapping = STATUS_BY_EVENT[event.type];
    if (mapping && event.data.email_id) {
      const update: Record<string, unknown> = { status: mapping.status };
      if (mapping.timestampField) {
        update[mapping.timestampField] = event.created_at ?? new Date().toISOString();
      }
      await admin.from("notification_log").update(update).eq("resend_message_id", event.data.email_id);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Resend webhook handling error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
