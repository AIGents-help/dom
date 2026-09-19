import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification, type EmailType, type RecipientType } from "@/lib/resend/client";
import {
  adminPaymentFailed,
  deliverableSubmissionReminder,
  missionReminder24h,
  payoutCompleted,
} from "@/lib/resend/templates";

const HOUR_MS = 60 * 60 * 1000;
const REMINDER_WINDOW_HOURS = 36;
const DELIVERABLE_GRACE_HOURS = 12;
const DELIVERED_NOTIFICATION_STATUSES = ["queued", "sent", "delivered", "opened", "clicked"];

type Contractor = { id: string; full_name: string | null; email: string | null };
type Assignment = {
  id: string;
  contractor_id: string;
  status: string;
  assignment_role: string | null;
  submitted_at: string | null;
  contractor: Contractor | Contractor[] | null;
};
type Job = {
  id: string;
  mission_request_id: string;
  title: string | null;
  location: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  status: string;
  assignments: Assignment[] | null;
};
type Payment = {
  id: string;
  mission_request_id: string | null;
  assignment_id: string | null;
  contractor_id: string | null;
  status: string;
  contractor_amount_cents: number | null;
  stripe_transfer_id: string | null;
  transfer_error: string | null;
  transfer_attempted_at: string | null;
  contractor: Contractor | Contractor[] | null;
  assignment: { job: { title: string | null } | { title: string | null }[] | null } | { job: { title: string | null } | { title: string | null }[] | null }[] | null;
};

export interface MissionNotificationRun {
  checkedJobs: number;
  missionReminders: number;
  deliverableReminders: number;
  payoutConfirmations: number;
  paymentFailureAlerts: number;
  skipped: number;
  failed: number;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function shouldSendMissionReminder(scheduledFor: string | null, status: string, now: Date): boolean {
  if (!scheduledFor || !["accepted", "scheduled"].includes(status)) return false;
  const scheduled = new Date(scheduledFor).getTime();
  const delta = scheduled - now.getTime();
  return Number.isFinite(scheduled) && delta > 0 && delta <= REMINDER_WINDOW_HOURS * HOUR_MS;
}

export function shouldSendDeliverableReminder(
  completedAt: string | null,
  submittedAt: string | null,
  assignmentStatus: string,
  now: Date,
): boolean {
  if (!completedAt || submittedAt || ["submitted", "qc_passed", "qc_rejected", "paid", "cancelled", "declined"].includes(assignmentStatus)) return false;
  const completed = new Date(completedAt).getTime();
  return Number.isFinite(completed) && now.getTime() - completed >= DELIVERABLE_GRACE_HOURS * HOUR_MS;
}

function readableDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
}

export async function runMissionNotifications(now = new Date()): Promise<MissionNotificationRun> {
  const admin = getSupabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.droneopsman.com";
  const result: MissionNotificationRun = {
    checkedJobs: 0,
    missionReminders: 0,
    deliverableReminders: 0,
    payoutConfirmations: 0,
    paymentFailureAlerts: 0,
    skipped: 0,
    failed: 0,
  };

  const [{ data: jobRows, error: jobsError }, { data: paymentRows, error: paymentsError }] = await Promise.all([
    admin
      .from("jobs")
      .select("id,mission_request_id,title,location,scheduled_for,completed_at,status,assignments:mission_assignments(id,contractor_id,status,assignment_role,submitted_at,contractor:contractors(id,full_name,email))")
      .not("status", "eq", "cancelled"),
    admin
      .from("payments")
      .select("id,mission_request_id,assignment_id,contractor_id,status,contractor_amount_cents,stripe_transfer_id,transfer_error,transfer_attempted_at,contractor:contractors(id,full_name,email),assignment:mission_assignments(job:jobs(title))")
      .or("status.eq.paid_out,status.eq.failed,transfer_error.not.is.null"),
  ]);
  if (jobsError) throw new Error(`Mission notification job query failed: ${jobsError.message}`);
  if (paymentsError) throw new Error(`Mission notification payment query failed: ${paymentsError.message}`);

  const jobs = (jobRows ?? []) as unknown as Job[];
  const payments = (paymentRows ?? []) as unknown as Payment[];
  result.checkedJobs = jobs.length;

  async function alreadyHandled(eventKey: string): Promise<boolean> {
    const { data, error } = await admin
      .from("notification_log")
      .select("id")
      .eq("metadata->>event_key", eventKey)
      .in("status", DELIVERED_NOTIFICATION_STATUSES)
      .limit(1);
    if (error) throw new Error(`Notification history check failed: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  async function sendOnce(params: {
    eventKey: string;
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
  }): Promise<"sent" | "skipped" | "failed"> {
    if (await alreadyHandled(params.eventKey)) return "skipped";
    try {
      const sent = await sendNotification({
        ...params,
        metadata: { ...params.metadata, event_key: params.eventKey, trigger: "daily_operations" },
        idempotencyKey: params.eventKey.replace(/:/g, "/").slice(0, 256),
      });
      return sent.success ? "sent" : "failed";
    } catch (error) {
      console.error(`Operational notification failed (${params.emailType}):`, error);
      return "failed";
    }
  }

  function count(outcome: "sent" | "skipped" | "failed", field: keyof Pick<MissionNotificationRun, "missionReminders" | "deliverableReminders" | "payoutConfirmations" | "paymentFailureAlerts">) {
    if (outcome === "sent") result[field]++;
    else if (outcome === "skipped") result.skipped++;
    else result.failed++;
  }

  for (const job of jobs) {
    for (const assignment of job.assignments ?? []) {
      const pilot = one(assignment.contractor);
      if (!pilot?.email) continue;
      const missionTitle = job.title ?? "Your Mission";

      if (shouldSendMissionReminder(job.scheduled_for, assignment.status, now)) {
        const eventKey = `pilot_mission_reminder_24h:${job.id}:${assignment.id}:${job.scheduled_for}`;
        const template = missionReminder24h({
          pilotName: pilot.full_name ?? "there",
          missionTitle,
          scheduledDate: readableDate(job.scheduled_for!),
          location: job.location ?? "See mission briefing",
          missionUrl: `${siteUrl}/pilot`,
        });
        count(await sendOnce({
          eventKey,
          to: pilot.email,
          emailType: "pilot_mission_reminder_24h",
          recipientType: "pilot",
          recipientEntityId: pilot.id,
          missionRequestId: job.mission_request_id,
          jobId: job.id,
          assignmentId: assignment.id,
          subject: template.subject,
          html: template.html,
          metadata: { scheduledFor: job.scheduled_for },
        }), "missionReminders");
      }

      if (shouldSendDeliverableReminder(job.completed_at, assignment.submitted_at, assignment.status, now)) {
        const eventKey = `deliverable_submission_reminder:${job.id}:${assignment.id}:${job.completed_at}`;
        const template = deliverableSubmissionReminder({
          pilotName: pilot.full_name ?? "there",
          missionTitle,
          missionUrl: `${siteUrl}/pilot`,
        });
        count(await sendOnce({
          eventKey,
          to: pilot.email,
          emailType: "deliverable_submission_reminder",
          recipientType: "pilot",
          recipientEntityId: pilot.id,
          missionRequestId: job.mission_request_id,
          jobId: job.id,
          assignmentId: assignment.id,
          subject: template.subject,
          html: template.html,
          metadata: { fieldCompletedAt: job.completed_at },
        }), "deliverableReminders");
      }
    }
  }

  for (const payment of payments) {
    const pilot = one(payment.contractor);
    const assignment = one(payment.assignment);
    const job = one(assignment?.job);
    if (payment.status === "paid_out" && pilot?.email && payment.contractor_amount_cents != null) {
      const eventKey = `payout_completed:${payment.id}:${payment.stripe_transfer_id ?? "legacy"}`;
      const template = payoutCompleted({
        pilotName: pilot.full_name ?? "there",
        amountCents: payment.contractor_amount_cents,
        missionTitle: job?.title ?? undefined,
      });
      count(await sendOnce({
        eventKey,
        to: pilot.email,
        emailType: "payout_completed",
        recipientType: "pilot",
        recipientEntityId: pilot.id,
        missionRequestId: payment.mission_request_id ?? undefined,
        assignmentId: payment.assignment_id ?? undefined,
        subject: template.subject,
        html: template.html,
        metadata: { paymentId: payment.id, stripeTransferId: payment.stripe_transfer_id },
      }), "payoutConfirmations");
    }

    if ((payment.status === "failed" || payment.transfer_error) && process.env.NOTIFY_EMAIL) {
      const failureMarker = payment.transfer_attempted_at ?? payment.transfer_error ?? payment.status;
      const eventKey = `admin_payment_failed:${payment.id}:${failureMarker}`;
      const template = adminPaymentFailed({
        missionTitle: job?.title ?? "Mission payment",
        paymentId: payment.id,
        detail: payment.transfer_error ?? `Payment status: ${payment.status}`,
        adminUrl: payment.mission_request_id ? `${siteUrl}/admin/missions/${payment.mission_request_id}` : `${siteUrl}/admin/operations`,
      });
      count(await sendOnce({
        eventKey,
        to: process.env.NOTIFY_EMAIL,
        emailType: "admin_payment_failed",
        recipientType: "admin",
        missionRequestId: payment.mission_request_id ?? undefined,
        assignmentId: payment.assignment_id ?? undefined,
        subject: template.subject,
        html: template.html,
        metadata: { paymentId: payment.id, paymentStatus: payment.status, transferError: payment.transfer_error },
      }), "paymentFailureAlerts");
    }
  }

  return result;
}
