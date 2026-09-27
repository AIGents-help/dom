import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Resend client + notification_log writer for the mission lifecycle.
// Every send is logged to notification_log first as "queued" so a failed
// Resend call is still recorded rather than silently lost, then updated to
// "sent"/"failed" once the API responds. Delivery/open/click/bounce status
// after that point comes from app/api/webhooks/resend/route.ts.

const resendApiKey = process.env.RESEND_API_KEY || "re_placeholder_key";
export const resend = new Resend(resendApiKey);

// RESEND_FROM_TRANSACTIONAL doesn't exist as a configured var anywhere yet
// (checked .env.local, .env.example, and Vercel production) — falls back to
// the existing RESEND_FROM_EMAIL used by lib/resend.ts's mission-request
// emails so nothing breaks if it's never set.
const FROM_ADDRESS =
  process.env.RESEND_FROM_TRANSACTIONAL ||
  process.env.RESEND_FROM_EMAIL ||
  "Drone Operation Management <ops@droneopsman.com>";

// Matches the live email_notification_type enum exactly (confirmed via
// direct Supabase query against migration dom_notification_resend_schema).
export type EmailType =
  | "booking_confirmation"
  | "mission_reminder_24h"
  | "mission_in_progress"
  | "mission_completed"
  | "deliverable_ready"
  | "invoice_sent"
  | "payment_received"
  | "mission_rescheduled"
  | "review_request"
  | "mission_available"
  | "mission_assigned"
  | "mission_briefing_ready"
  | "pilot_mission_reminder_24h"
  | "deliverable_submission_reminder"
  | "payout_initiated"
  | "payout_completed"
  | "certification_expiring"
  | "admin_new_booking"
  | "admin_deliverable_submitted"
  | "admin_payment_failed"
  | "admin_mission_claimed"
  | "unverified_pilot_welcome"
  | "verification_deadline_reminder"
  | "verification_deadline_final"
  | "shop_order_confirmation"
  | "shop_order_shipped"
  | "shop_order_refunded"
  | "admin_shop_order";

// Matches the live notification_recipient_type enum.
export type RecipientType = "customer" | "pilot" | "admin";

interface SendNotificationParams {
  to: string;
  emailType: EmailType;
  recipientType: RecipientType;
  recipientEntityId?: string;
  missionRequestId?: string;
  jobId?: string;
  assignmentId?: string;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  const admin = getSupabaseAdmin();
  let logRow: { id: string; status?: string | null; resend_message_id?: string | null } | null = null;

  if (params.idempotencyKey) {
    const { data: existing, error: existingError } = await admin
      .from("notification_log")
      .select("id,status,resend_message_id")
      .eq("idempotency_key", params.idempotencyKey)
      .maybeSingle();

    if (existingError) {
      console.error("notification_log lookup failed:", existingError.message);
    } else if (existing && ["sent", "delivered", "opened", "clicked"].includes(existing.status ?? "")) {
      return { success: true, messageId: existing.resend_message_id ?? undefined };
    } else if (existing) {
      const { data: refreshed, error: refreshError } = await admin
        .from("notification_log")
        .update({
          mission_request_id: params.missionRequestId ?? null,
          job_id: params.jobId ?? null,
          assignment_id: params.assignmentId ?? null,
          recipient_type: params.recipientType,
          recipient_email: params.to,
          recipient_entity_id: params.recipientEntityId ?? null,
          email_type: params.emailType,
          status: "queued",
          subject: params.subject,
          metadata: params.metadata ?? {},
          error_message: null,
        })
        .eq("id", existing.id)
        .select("id,status,resend_message_id")
        .single();
      if (refreshError) console.error("notification_log refresh failed:", refreshError.message);
      else logRow = refreshed;
    }
  }

  if (!logRow) {
    const { data: inserted, error: logInsertError } = await admin
      .from("notification_log")
      .insert({
        mission_request_id: params.missionRequestId ?? null,
        job_id: params.jobId ?? null,
        assignment_id: params.assignmentId ?? null,
        recipient_type: params.recipientType,
        recipient_email: params.to,
        recipient_entity_id: params.recipientEntityId ?? null,
        email_type: params.emailType,
        status: "queued",
        subject: params.subject,
        metadata: params.metadata ?? {},
        idempotency_key: params.idempotencyKey ?? null,
      })
      .select("id,status,resend_message_id")
      .single();

    if (logInsertError) {
      console.error("notification_log insert failed:", logInsertError.message);
    } else {
      logRow = inserted;
    }
  }

  const result = await resend.emails.send(
    {
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );

  if (result.error) {
    console.error(`Resend send failed (${params.emailType} -> ${params.to}):`, result.error.message);
    if (logRow) {
      await admin
        .from("notification_log")
        .update({ status: "failed", error_message: result.error.message })
        .eq("id", logRow.id);
    }
    return { success: false, error: result.error.message };
  }

  if (logRow) {
    await admin
      .from("notification_log")
      .update({
        status: "sent",
        resend_message_id: result.data?.id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", logRow.id);
  }

  return { success: true, messageId: result.data?.id };
}
