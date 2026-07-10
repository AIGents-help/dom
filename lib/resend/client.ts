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
  | "verification_deadline_final";

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
}

interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  const admin = getSupabaseAdmin();

  const { data: logRow, error: logInsertError } = await admin
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
    })
    .select("id")
    .single();

  if (logInsertError) {
    // Non-fatal — still attempt the send even if logging failed, but make
    // sure this doesn't disappear silently.
    console.error("notification_log insert failed:", logInsertError.message);
  }

  const result = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

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
