import { formatCents } from "@/lib/quoting";

// Email templates for the mission lifecycle notification system. There was
// no existing shell()/button() pattern to follow (lib/resend/templates.ts
// didn't exist anywhere in this codebase before this file) — this
// establishes one, matching the dark/cyan branding already used in the
// existing client-facing quote confirmation email (lib/resend.ts) rather
// than the pilot dashboard's amber theme, since customers have already seen
// that look.
//
// Every template returns { subject, html } — pass both straight into
// sendNotification() from lib/resend/client.ts.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shell(title: string, bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; max-width:560px; margin:0 auto; color:#1a1a1a;">
      <div style="background:#05080f; padding:24px 32px;">
        <span style="color:#22d3ee; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:600;">Drone Operation Management</span>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 12px; font-size:20px;">${escapeHtml(title)}</h2>
        ${bodyHtml}
        <p style="color:#444; margin-top:24px;">— Drone Operation Management</p>
      </div>
    </div>
  `;
}

export function button(label: string, url: string): string {
  return `
    <a href="${url}" style="display:inline-block; background:#0891b2; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 24px; border-radius:8px; margin:16px 0;">
      ${escapeHtml(label)}
    </a>
  `;
}

function infoRow(label: string, value: string): string {
  return `<tr><td style="padding:4px 0; color:#666; font-size:13px;">${escapeHtml(label)}</td><td style="padding:4px 0; text-align:right; color:#1a1a1a; font-size:13px; font-weight:600;">${escapeHtml(value)}</td></tr>`;
}

function infoTable(rows: string): string {
  return `<table style="width:100%; border-collapse:collapse; margin:16px 0;">${rows}</table>`;
}

interface TemplateResult {
  subject: string;
  html: string;
}

// ---- Implemented and wired (or ready to wire) ----

export function bookingConfirmation(params: {
  clientName: string;
  missionTitle?: string;
  serviceType?: string;
  location?: string;
  scheduledDate?: string;
  totalCents?: number;
}): TemplateResult {
  const rows = [
    params.serviceType ? infoRow("Service", params.serviceType.replace(/_/g, " ")) : "",
    params.location ? infoRow("Location", params.location) : "",
    params.scheduledDate ? infoRow("Scheduled", params.scheduledDate) : "",
    params.totalCents != null ? infoRow("Total", formatCents(params.totalCents)) : "",
  ].join("");

  return {
    subject: `Booking Confirmed — ${params.missionTitle ?? "Your Mission"}`,
    html: shell(
      "Your mission is confirmed",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, your mission has been approved and scheduled.</p>
        ${rows ? infoTable(rows) : ""}
        <p style="color:#444; line-height:1.5;">We'll be in touch with any updates ahead of the flight.</p>
      `
    ),
  };
}

export function deliverableReady(params: {
  clientName: string;
  missionTitle?: string;
  deliverableUrl?: string;
}): TemplateResult {
  return {
    subject: `Your Deliverables Are Ready — ${params.missionTitle ?? "Your Mission"}`,
    html: shell(
      "Your deliverables are ready",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, the final deliverables for your mission are ready to view.</p>
        ${params.deliverableUrl ? button("View Deliverables", params.deliverableUrl) : ""}
      `
    ),
  };
}

export function invoiceSent(params: {
  clientName: string;
  amountCents: number;
  invoiceUrl?: string;
  dueDate?: string;
}): TemplateResult {
  const rows = [
    infoRow("Amount due", formatCents(params.amountCents)),
    params.dueDate ? infoRow("Due date", params.dueDate) : "",
  ].join("");

  return {
    subject: `Invoice — ${formatCents(params.amountCents)} Due`,
    html: shell(
      "You have a new invoice",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, an invoice has been issued for your mission.</p>
        ${infoTable(rows)}
        ${params.invoiceUrl ? button("Pay Invoice", params.invoiceUrl) : ""}
      `
    ),
  };
}

export function missionAvailable(params: {
  pilotName: string;
  missionTitle: string;
  serviceType: string;
  location: string;
  payoutCents: number;
}): TemplateResult {
  const rows = [
    infoRow("Service", params.serviceType.replace(/_/g, " ")),
    infoRow("Location", params.location),
    infoRow("Payout", formatCents(params.payoutCents)),
  ].join("");

  return {
    subject: `New Mission Available — ${params.missionTitle}`,
    html: shell(
      "A new mission matches your area",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, a new mission is available for you to accept.</p>
        ${infoTable(rows)}
      `
    ),
  };
}

export function missionClaimed(params: {
  pilotName: string;
  serviceType: string;
  payoutCents: number | null;
  reviewUrl: string;
}): TemplateResult {
  const rows = [
    infoRow("Service", params.serviceType.replace(/_/g, " ")),
    params.payoutCents != null ? infoRow("Payout", formatCents(params.payoutCents)) : "",
  ].join("");

  return {
    subject: `Pilot Claimed a Queue Mission — ${params.serviceType.replace(/_/g, " ")}`,
    html: shell(
      "A pilot requested a mission from the queue",
      `
        <p style="color:#444; line-height:1.5;">${escapeHtml(params.pilotName)} requested this mission from the open queue. It won't be assigned until you review and approve it.</p>
        ${infoTable(rows)}
        ${button("Review Claim", params.reviewUrl)}
      `
    ),
  };
}

export function missionBriefingReady(params: {
  pilotName: string;
  missionTitle: string;
  briefingUrl: string;
}): TemplateResult {
  return {
    subject: `Mission Briefing Ready — ${params.missionTitle}`,
    html: shell(
      "Your mission briefing is ready",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, the full briefing for your upcoming mission — documents, contacts, permissions, and site details — is ready to review.</p>
        ${button("Open Briefing", params.briefingUrl)}
      `
    ),
  };
}

export function payoutInitiated(params: {
  pilotName: string;
  amountCents: number;
  expectedArrivalDate?: string;
}): TemplateResult {
  const rows = [
    infoRow("Amount", formatCents(params.amountCents)),
    params.expectedArrivalDate ? infoRow("Expected arrival", params.expectedArrivalDate) : "",
  ].join("");

  return {
    subject: `Payout Initiated — ${formatCents(params.amountCents)}`,
    html: shell(
      "Your payout is on its way",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, a payout for your completed mission has been initiated.</p>
        ${infoTable(rows)}
      `
    ),
  };
}

// ---- Stubs — typed params, no trigger wired yet ----

export function missionReminder24h(params: {
  pilotName: string;
  missionTitle: string;
  scheduledDate: string;
  location: string;
}): TemplateResult {
  return {
    subject: `Reminder: Mission Tomorrow — ${params.missionTitle}`,
    html: shell(
      "Your mission is tomorrow",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, this is a reminder that your mission is scheduled for ${escapeHtml(params.scheduledDate)} at ${escapeHtml(params.location)}.</p>
      `
    ),
  };
}

export function missionCompleted(params: {
  clientName: string;
  missionTitle: string;
}): TemplateResult {
  return {
    subject: `Mission Completed — ${params.missionTitle}`,
    html: shell(
      "Your mission has been completed",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, your mission has been flown and is now in processing. Deliverables will follow shortly.</p>
      `
    ),
  };
}

export function missionRescheduled(params: {
  clientName: string;
  missionTitle: string;
  newScheduledDate: string;
}): TemplateResult {
  return {
    subject: `Mission Rescheduled — ${params.missionTitle}`,
    html: shell(
      "Your mission has been rescheduled",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, your mission has a new scheduled date: ${escapeHtml(params.newScheduledDate)}.</p>
      `
    ),
  };
}

export function missionAssigned(params: {
  pilotName: string;
  missionTitle: string;
  scheduledDate?: string;
}): TemplateResult {
  return {
    subject: `Mission Assigned — ${params.missionTitle}`,
    html: shell(
      "You've been assigned a mission",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, you've been assigned to ${escapeHtml(params.missionTitle)}${params.scheduledDate ? ` on ${escapeHtml(params.scheduledDate)}` : ""}.</p>
      `
    ),
  };
}

export function deliverableSubmissionReminder(params: {
  pilotName: string;
  missionTitle: string;
}): TemplateResult {
  return {
    subject: `Reminder: Submit Your Deliverables — ${params.missionTitle}`,
    html: shell(
      "Deliverables still due",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, don't forget to submit your deliverables for ${escapeHtml(params.missionTitle)}.</p>
      `
    ),
  };
}

export function payoutCompleted(params: {
  pilotName: string;
  amountCents: number;
}): TemplateResult {
  return {
    subject: `Payout Completed — ${formatCents(params.amountCents)}`,
    html: shell(
      "Your payout has arrived",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, your payout of ${formatCents(params.amountCents)} has completed and should now be in your account.</p>
      `
    ),
  };
}

export function certificationExpiring(params: {
  pilotName: string;
  certificationName: string;
  expiresOn: string;
}): TemplateResult {
  return {
    subject: `${params.certificationName} Expiring Soon`,
    html: shell(
      "A certification is expiring soon",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, your ${escapeHtml(params.certificationName)} expires on ${escapeHtml(params.expiresOn)}. Renew it to stay cleared for missions.</p>
      `
    ),
  };
}
