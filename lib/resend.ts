import { Resend } from "resend";
import { formatCents } from "./quoting";

const resendApiKey = process.env.RESEND_API_KEY || "re_placeholder_key";

export const resend = new Resend(resendApiKey);

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Drone Operation Management <ops@droneopsman.com>";
const NOTIFY_ADDRESS = process.env.NOTIFY_EMAIL || "ops@droneopsman.com";

// Loosely-typed mirror of QuoteBreakdown — the caller may pass either the
// full internal shape (admin-created missions, which persist commission
// data) or a partial one, so every field is optional and modifiers isn't
// pinned to the exact key set.
type QuoteEmailData = {
  serviceLabel?: string;
  basePriceCents?: number;
  modifiers?: Record<string, { factor: number; label: string }>;
  totalCents?: number;
  commissionCents?: number;
  contractorPayoutCents?: number;
  warnings?: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function quoteModifierRows(quote: QuoteEmailData): string {
  const mods = quote.modifiers;
  if (!mods) return "";
  const rows: [string, { factor: number; label: string } | undefined][] = [
    ["Location", mods.location],
    ["Airspace", mods.airspace],
    ["Complexity", mods.complexity],
    ["Timeline", mods.urgency],
    ["Deliverables", mods.deliverable],
  ];
  return rows
    .filter(([, m]) => m)
    .map(
      ([label, m]) =>
        `<tr><td style="padding:4px 0; color:#555;">${label} × ${m!.factor}</td><td style="padding:4px 0; text-align:right; color:#555;">${escapeHtml(m!.label)}</td></tr>`
    )
    .join("");
}

function quoteWarningsBlock(quote: QuoteEmailData): string {
  if (!quote.warnings?.length) return "";
  const items = quote.warnings.map((w) => `<p style="color:#9a3412; font-size:13px; margin:4px 0;">⚠ ${escapeHtml(w)}</p>`).join("");
  return `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px 16px; margin:16px 0;">${items}</div>`;
}

// The client-facing quote summary. Explicitly strips commission/payout
// fields even though the caller shouldn't be passing them in for this
// section — matching the same public-safe rule enforced on /api/quote
// and /api/airspace, so this can never leak DOM's margin.
function quoteSummaryForClient(quote: QuoteEmailData): string {
  const { commissionCents, contractorPayoutCents, ...q } = quote;
  const total = q.totalCents != null ? formatCents(q.totalCents) : null;
  return `
    <div style="border:1px solid #e2e2e2; border-radius:10px; padding:20px; margin:20px 0;">
      <p style="font-size:13px; color:#666; margin:0 0 4px;">${escapeHtml(q.serviceLabel ?? "Your mission")}</p>
      ${total ? `<p style="font-size:32px; font-weight:700; margin:0 0 16px; color:#0891b2;">${total}</p>` : ""}
      <table style="width:100%; font-size:13px; border-collapse:collapse;">
        ${q.basePriceCents != null ? `<tr><td style="padding:4px 0; color:#555;">Base price</td><td style="padding:4px 0; text-align:right; color:#555;">${formatCents(q.basePriceCents)}</td></tr>` : ""}
        ${quoteModifierRows(q)}
      </table>
    </div>
    ${quoteWarningsBlock(q)}
  `;
}

// Internal version keeps the full breakdown, including commission/payout —
// this email only ever goes to NOTIFY_ADDRESS (DOM's own ops inbox).
function quoteSummaryForOps(quote: QuoteEmailData): string {
  const total = quote.totalCents != null ? formatCents(quote.totalCents) : "N/A";
  const commission = quote.commissionCents != null ? formatCents(quote.commissionCents) : "N/A";
  const payout = quote.contractorPayoutCents != null ? formatCents(quote.contractorPayoutCents) : "N/A";
  return `
    <div style="border:1px solid #e2e2e2; border-radius:10px; padding:16px; margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>${escapeHtml(quote.serviceLabel ?? "Quote")}</strong> — Total: ${total}</p>
      <table style="width:100%; font-size:13px; border-collapse:collapse;">
        ${quoteModifierRows(quote)}
      </table>
      <p style="margin:8px 0 0; font-size:13px;">DOM commission: ${commission} · Contractor payout: ${payout}</p>
    </div>
    ${quoteWarningsBlock(quote)}
  `;
}

export async function sendMissionRequestEmails(payload: {
  contactName: string;
  contactEmail: string;
  company?: string;
  industry?: string;
  serviceType?: string;
  details?: string;
  location?: string;
  quote?: QuoteEmailData;
}) {
  const hasQuote = payload.quote?.totalCents != null;

  // resend.emails.send() resolves with { error } on failure rather than
  // throwing (e.g. an unverified sending domain) — log it explicitly so a
  // failure isn't silently swallowed by the caller's best-effort try/catch.
  const logIfFailed = (label: string, result: { error: { message: string } | null }) => {
    if (result.error) console.error(`Resend send failed (${label}):`, result.error.message);
  };

  // Internal notification to the ops team
  logIfFailed(
    "internal notification",
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: NOTIFY_ADDRESS,
      subject: `New Mission Request — ${payload.contactName}`,
      html: `
        <h2>New Mission Request</h2>
        <p><strong>Name:</strong> ${escapeHtml(payload.contactName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.contactEmail)}</p>
        <p><strong>Company:</strong> ${payload.company ? escapeHtml(payload.company) : "N/A"}</p>
        <p><strong>Industry:</strong> ${payload.industry ? escapeHtml(payload.industry) : "N/A"}</p>
        <p><strong>Service:</strong> ${payload.serviceType ? escapeHtml(payload.serviceType) : "N/A"}</p>
        <p><strong>Location:</strong> ${payload.location ? escapeHtml(payload.location) : "N/A"}</p>
        <p><strong>Details:</strong> ${payload.details ? escapeHtml(payload.details) : "N/A"}</p>
        ${hasQuote ? quoteSummaryForOps(payload.quote!) : ""}
      `,
    })
  );

  // Confirmation to the requester
  if (hasQuote) {
    logIfFailed(
      "client quote confirmation",
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: payload.contactEmail,
        subject: "Your Instant Quote — Drone Operation Management",
        html: `
          <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; max-width:560px; margin:0 auto; color:#1a1a1a;">
            <div style="background:#05080f; padding:24px 32px;">
              <span style="color:#22d3ee; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:600;">Drone Operation Management</span>
            </div>
            <div style="padding:32px;">
              <h2 style="margin:0 0 12px; font-size:20px;">Your instant quote is ready</h2>
              <p style="color:#444; line-height:1.5;">
                Hi ${escapeHtml(payload.contactName)}, here's the quote you generated${payload.location ? ` for your mission at ${escapeHtml(payload.location)}` : ""}.
              </p>
              ${quoteSummaryForClient(payload.quote!)}
              <p style="color:#444; line-height:1.5;">
                This is an automated estimate based on airspace classification and scope. Our operations team will confirm final scope and compliance, then follow up within one business day to schedule your mission.
              </p>
              <p style="color:#444; margin-top:24px;">— Drone Operation Management</p>
            </div>
          </div>
        `,
      })
    );
  } else {
    logIfFailed(
      "client confirmation",
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: payload.contactEmail,
        subject: "Mission Request Received — Drone Operation Management",
        html: `
          <p>Hi ${escapeHtml(payload.contactName)},</p>
          <p>Thank you for submitting a mission request to Drone Operation Management. Our operations team will review your request and follow up within one business day with scope, FAA airspace authorization status, and scheduling options.</p>
          <p>— Drone Operation Management</p>
        `,
      })
    );
  }
}

// ---------------------------------------------------------------------
// Mission-lifecycle notifications (booking confirmed, deliverable ready).
// Uses the live console brand tokens — signal (amber) / telemetry (cyan) —
// matching PilotCreateMissionWizard.tsx / PilotProfileEditor.tsx, not the
// older cyan-primary palette above. Every send is logged to
// notification_log so delivery can be tracked via the Resend webhook.
// ---------------------------------------------------------------------

import { getSupabaseAdmin } from "./supabaseAdmin";

const V = { ground: "#0A0E14", surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", signal: "#FF8A3D", telemetry: "#4FD1C5" };

type NotificationType =
  | "booking_confirmation" | "deliverable_ready" | "invoice_sent"
  | "payout_initiated" | "mission_available" | "mission_briefing_ready";

async function logNotification(params: {
  to: string;
  emailType: NotificationType;
  recipientType: "customer" | "pilot" | "admin";
  missionRequestId?: string;
  jobId?: string;
  assignmentId?: string;
  subject: string;
  resendMessageId: string | null;
  failed: boolean;
  errorMessage?: string;
}) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from("notification_log").insert({
      mission_request_id: params.missionRequestId ?? null,
      job_id: params.jobId ?? null,
      assignment_id: params.assignmentId ?? null,
      recipient_type: params.recipientType,
      recipient_email: params.to,
      email_type: params.emailType,
      resend_message_id: params.resendMessageId,
      status: params.failed ? "failed" : "sent",
      subject: params.subject,
      error_message: params.errorMessage ?? null,
      sent_at: params.failed ? null : new Date().toISOString(),
    });
  } catch (e) {
    // Logging failure shouldn't block the actual send — just surface it.
    console.error("notification_log insert failed:", e);
  }
}

function consoleShell(bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; max-width:560px; margin:0 auto; color:${V.ink}; background:#ffffff;">
      <div style="background:${V.ground}; padding:24px 32px;">
        <span style="color:${V.signal}; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:600;">Drone Operation Management</span>
      </div>
      <div style="padding:32px; color:#1a1a1a;">
        ${bodyHtml}
      </div>
      <div style="padding:16px 32px; border-top:1px solid #eee; color:#8A95A7; font-size:12px;">
        droneopsman.com
      </div>
    </div>`;
}

function consoleButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block; background:${V.signal}; color:${V.ground}; font-weight:700; padding:12px 24px; border-radius:6px; text-decoration:none; margin-top:16px;">${label}</a>`;
}

export async function sendBookingConfirmation(p: {
  missionRequestId: string;
  clientEmail: string;
  clientName: string;
  serviceType: string;
  scheduledDate?: string;
  portalUrl: string;
}) {
  const subject = `Mission Confirmed — ${p.serviceType}`;
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: p.clientEmail,
    subject,
    html: consoleShell(`
      <h2 style="margin:0 0 12px;">Your mission is confirmed, ${escapeHtml(p.clientName)}.</h2>
      <p style="color:#444; line-height:1.5;"><strong>Service:</strong> ${escapeHtml(p.serviceType)}${p.scheduledDate ? `<br/><strong>Scheduled:</strong> ${escapeHtml(p.scheduledDate)}` : ""}</p>
      <p style="color:#444; line-height:1.5;">We'll notify you as soon as your mission is complete and deliverables are ready.</p>
      ${consoleButton("View Mission Status", p.portalUrl)}
    `),
  });
  if (error) console.error("Resend send failed (booking_confirmation):", error.message);
  await logNotification({
    to: p.clientEmail, emailType: "booking_confirmation", recipientType: "customer",
    missionRequestId: p.missionRequestId, subject,
    resendMessageId: data?.id ?? null, failed: !!error, errorMessage: error?.message,
  });
}

export async function sendDeliverableReady(p: {
  jobId: string;
  missionRequestId?: string;
  clientEmail: string;
  clientName: string;
  propertyAddress: string;
  deliverableUrl: string;
  reviewUrl: string;
}) {
  const subject = `Your Deliverables Are Ready — ${p.propertyAddress}`;
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: p.clientEmail,
    subject,
    html: consoleShell(`
      <h2 style="margin:0 0 12px;">Deliverables are ready, ${escapeHtml(p.clientName)}.</h2>
      <p style="color:#444; line-height:1.5;">Your inspection report and imagery for <strong>${escapeHtml(p.propertyAddress)}</strong> are ready to download.</p>
      ${consoleButton("Download Deliverables", p.deliverableUrl)}
      <p style="color:#444; line-height:1.5; margin-top:28px; padding-top:20px; border-top:1px solid #eee;">
        Was this useful? A quick review helps other property owners find us —
        <a href="${p.reviewUrl}" style="color:${V.signal}; font-weight:600;">leave a review</a>.
      </p>
    `),
  });
  if (error) console.error("Resend send failed (deliverable_ready):", error.message);
  await logNotification({
    to: p.clientEmail, emailType: "deliverable_ready", recipientType: "customer",
    jobId: p.jobId, missionRequestId: p.missionRequestId, subject,
    resendMessageId: data?.id ?? null, failed: !!error, errorMessage: error?.message,
  });
}
