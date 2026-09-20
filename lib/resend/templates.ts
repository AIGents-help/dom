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

export function shell(title: string, bodyHtml: string, providerName = "Drone Operation Management"): string {
  return `
    <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; max-width:560px; margin:0 auto; color:#1a1a1a;">
      <div style="background:#05080f; padding:24px 32px;">
        <span style="color:#22d3ee; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:600;">${escapeHtml(providerName)}</span>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 12px; font-size:20px;">${escapeHtml(title)}</h2>
        ${bodyHtml}
        <p style="color:#444; margin-top:24px;">— ${escapeHtml(providerName)}</p>
        ${providerName === "Drone Operation Management" ? "" : '<p style="color:#888; margin-top:20px; font-size:11px;">Workflow powered by DOM</p>'}
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

export function shopOrderConfirmation(params: {
  customerName: string;
  orderNumber: string;
  itemSummary: string;
  totalCents: number;
}): TemplateResult {
  return {
    subject: `Order Confirmed — ${params.orderNumber}`,
    html: shell("We received your equipment order", `
      <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.customerName)}, your payment was received and your order is in the fulfillment queue.</p>
      ${infoTable(infoRow("Order", params.orderNumber) + infoRow("Items", params.itemSummary) + infoRow("Total", formatCents(params.totalCents)))}
      <p style="color:#444; line-height:1.5;">We will email tracking details when the order ships.</p>
    `),
  };
}

export function adminShopOrder(params: { orderNumber: string; itemSummary: string; totalCents: number; adminUrl: string }): TemplateResult {
  return {
    subject: `New Shop Order — ${params.orderNumber}`,
    html: shell("A paid shop order is ready", `
      ${infoTable(infoRow("Order", params.orderNumber) + infoRow("Items", params.itemSummary) + infoRow("Total", formatCents(params.totalCents)))}
      ${button("Open Fulfillment Queue", params.adminUrl)}
    `),
  };
}

export function shopOrderShipped(params: { customerName: string; orderNumber: string; carrier: string; trackingNumber: string; trackingUrl?: string }): TemplateResult {
  return {
    subject: `Order Shipped — ${params.orderNumber}`,
    html: shell("Your order is on the way", `
      <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.customerName)}, ${escapeHtml(params.orderNumber)} has shipped.</p>
      ${infoTable(infoRow("Carrier", params.carrier) + infoRow("Tracking", params.trackingNumber))}
      ${params.trackingUrl ? button("Track Shipment", params.trackingUrl) : ""}
    `),
  };
}

export function shopOrderRefunded(params: { customerName: string; orderNumber: string; totalCents: number }): TemplateResult {
  return {
    subject: `Order Refunded — ${params.orderNumber}`,
    html: shell("Your order was refunded", `
      <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.customerName)}, ${formatCents(params.totalCents)} was refunded for ${escapeHtml(params.orderNumber)}. Your bank controls when the credit appears.</p>
    `),
  };
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

export function deliverableRevisionReady(params: {
  clientName: string;
  missionTitle?: string;
  deliverableName: string;
  revisionNumber?: number | null;
  deliverableUrl?: string;
}): TemplateResult {
  const revisionLabel = params.revisionNumber && params.revisionNumber > 1 ? ` revision ${params.revisionNumber}` : " corrected revision";
  return {
    subject: `Corrected Deliverable Ready — ${params.missionTitle ?? "Your Mission"}`,
    html: shell(
      "Your corrected deliverable is ready for review",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, the requested correction to <strong>${escapeHtml(params.deliverableName)}</strong> has passed DOM quality review.</p>
        <p style="color:#444; line-height:1.5;">The${escapeHtml(revisionLabel)} is now the active version and is ready for your approval.</p>
        ${params.deliverableUrl ? button("Review Corrected Deliverable", params.deliverableUrl) : ""}
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

export function paymentReceived(params: {
  clientName: string;
  amountCents: number;
  missionTitle?: string;
}): TemplateResult {
  return {
    subject: `Payment Received — ${formatCents(params.amountCents)}`,
    html: shell(
      "Payment received — thank you",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, we've received your payment${
        params.missionTitle ? ` for ${escapeHtml(params.missionTitle)}` : ""
      } of ${formatCents(params.amountCents)}.</p>
        <p style="color:#444; line-height:1.5;">We'll be in touch as your mission progresses.</p>
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
  missionUrl?: string;
}): TemplateResult {
  return {
    subject: `Reminder: Mission Tomorrow — ${params.missionTitle}`,
    html: shell(
      "Your mission is tomorrow",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, this is a reminder that your mission is scheduled for ${escapeHtml(params.scheduledDate)} at ${escapeHtml(params.location)}.</p>
        <p style="color:#444; line-height:1.5;">Open the briefing now to confirm airspace, weather, access, aircraft, insurance, and the capture plan before departure.</p>
        ${params.missionUrl ? button("Review Mission Briefing", params.missionUrl) : ""}
      `
    ),
  };
}

export function missionCompleted(params: {
  clientName: string;
  missionTitle: string;
  providerName?: string;
}): TemplateResult {
  return {
    subject: `Mission Completed — ${params.missionTitle}`,
    html: shell(
      "Your mission has been completed",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, your mission is complete and the approved deliverables are now available in your client portal.</p>
      `,
      params.providerName ?? "Drone Operation Management",
    ),
  };
}

export function clientPilotAssigned(params: {
  clientName: string;
  missionTitle: string;
  pilotName: string;
}): TemplateResult {
  return {
    subject: `Pilot Assigned — ${params.missionTitle}`,
    html: shell(
      "A pilot has been assigned",
      `<p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, ${escapeHtml(params.pilotName)} has accepted and is now assigned to your mission, ${escapeHtml(params.missionTitle)}.</p>
       <p style="color:#444; line-height:1.5;">We’ll send another update when the performance date is scheduled.</p>`
    ),
  };
}

export function clientMissionScheduled(params: {
  clientName: string;
  missionTitle: string;
  scheduledDate: string;
  location?: string;
  rescheduled?: boolean;
}): TemplateResult {
  const title = params.rescheduled ? "Your mission has been rescheduled" : "Your mission has been scheduled";
  return {
    subject: `${params.rescheduled ? "Mission Rescheduled" : "Mission Scheduled"} — ${params.missionTitle}`,
    html: shell(
      title,
      `<p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.clientName)}, the performance date for ${escapeHtml(params.missionTitle)} is now ${escapeHtml(params.scheduledDate)}.</p>
       ${params.location ? infoTable(infoRow("Location", params.location)) : ""}
       <p style="color:#444; line-height:1.5;">We’ll notify you again when the mission is complete.</p>`
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
  missionUrl?: string;
}): TemplateResult {
  return {
    subject: `Reminder: Submit Your Deliverables — ${params.missionTitle}`,
    html: shell(
      "Deliverables still due",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, field capture is complete but the finished deliverables for ${escapeHtml(params.missionTitle)} have not been submitted.</p>
        <p style="color:#444; line-height:1.5;">Back up the media, upload every required deliverable and field note, then complete the mission's final approval step.</p>
        ${params.missionUrl ? button("Finish Mission Delivery", params.missionUrl) : ""}
      `
    ),
  };
}

export function payoutCompleted(params: {
  pilotName: string;
  amountCents: number;
  missionTitle?: string;
}): TemplateResult {
  return {
    subject: `Payout Released — ${formatCents(params.amountCents)}`,
    html: shell(
      "Your DOM payout was released",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(params.pilotName)}, DOM released ${formatCents(params.amountCents)}${params.missionTitle ? ` for ${escapeHtml(params.missionTitle)}` : ""} to your connected Stripe account.</p>
        <p style="color:#444; line-height:1.5;">Your bank-deposit timing is controlled by the payout schedule in Stripe.</p>
      `
    ),
  };
}

export function adminPaymentFailed(params: {
  missionTitle: string;
  paymentId: string;
  detail: string;
  adminUrl: string;
}): TemplateResult {
  return {
    subject: `Action Required: Mission Payment — ${params.missionTitle}`,
    html: shell(
      "A mission payment needs attention",
      `
        <p style="color:#444; line-height:1.5;">The payment or pilot transfer for ${escapeHtml(params.missionTitle)} did not complete.</p>
        ${infoTable(infoRow("Payment", params.paymentId) + infoRow("Issue", params.detail))}
        ${button("Open Mission", params.adminUrl)}
      `,
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

// ---- Unverified pilot tier: signup-to-verification deadline sequence ----

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function link(url: string): string {
  return `<a href="${url}" style="color:#0891b2;">${url}</a>`;
}

export function unverifiedPilotWelcome(params: {
  pilotName: string;
  deadlineDate: string;
  resourcesLink: string;
}): TemplateResult {
  return {
    subject: "You're in — here's your DOM access window",
    html: shell(
      "Welcome to DOM",
      `
        <p style="color:#444; line-height:1.5;">Hi ${escapeHtml(firstNameOf(params.pilotName))}, you're signed up. While you work toward your Part 107 certificate, you've got full access to the resource library and tutorials.</p>
        <p style="color:#444; line-height:1.5;"><strong>Your free access is active through ${escapeHtml(params.deadlineDate)} unless you're verified as a Part 107 pilot by then.</strong></p>
        <p style="color:#444; line-height:1.5;">Resources: ${link(params.resourcesLink)}</p>
      `
    ),
  };
}

const REMINDER_COPY: Record<14 | 7 | 3 | 1, { subject: string; body: (p: { firstName: string; deadlineDate: string; resourcesLink: string; verifyLink: string; upgradeLink?: string }) => string }> = {
  14: {
    subject: "14 days left on your free DOM access",
    body: (p) => `
      <p style="color:#444; line-height:1.5;">${escapeHtml(p.firstName)} — You've got 14 days of free resource access left before your DOM membership deadline on ${escapeHtml(p.deadlineDate)}. If you're on track for your Part 107 exam, this is just a heads-up — keep studying, submit your certificate number the day you pass, and your account upgrades to Verified Pilot automatically. If your timeline's slipped, now's the time to lock in a test date.</p>
      <p style="color:#444; line-height:1.5;">Resources: ${link(p.resourcesLink)}.</p>
      <p style="color:#444; line-height:1.5;">Already certified? Verify here and skip the rest of this sequence: ${link(p.verifyLink)}</p>
    `,
  },
  7: {
    subject: "One week until your free access ends",
    body: (p) => `
      <p style="color:#444; line-height:1.5;">${escapeHtml(p.firstName)} — 7 days left before ${escapeHtml(p.deadlineDate)}. Quick gut check: have you scheduled your knowledge test yet? If not, that's the single blocker between you and a Verified Pilot account — book it this week so results land before your deadline.</p>
      <p style="color:#444; line-height:1.5;">Study materials: ${link(p.resourcesLink)}.</p>
      <p style="color:#444; line-height:1.5;">Already passed? Verify now: ${link(p.verifyLink)}.</p>
      <p style="color:#444; line-height:1.5;">After ${escapeHtml(p.deadlineDate)}, unverified access pauses unless you're mid-verification or opt into a paid resource plan to keep going. No penalty either way — just want you to have the option before it's a surprise.</p>
    `,
  },
  3: {
    subject: "3 days — action needed to keep access",
    body: (p) => `
      <p style="color:#444; line-height:1.5;">${escapeHtml(p.firstName)} — Your free DOM access ends in 3 days (${escapeHtml(p.deadlineDate)}). Two ways to keep it:</p>
      <p style="color:#444; line-height:1.5;">1) Verified Pilot — submit your Part 107 certificate number: ${link(p.verifyLink)}.</p>
      <p style="color:#444; line-height:1.5;">2) Not certified yet but still working toward it — keep resource access on a paid plan: ${link(p.upgradeLink ?? p.verifyLink)}.</p>
      <p style="color:#444; line-height:1.5;">Do nothing, and access pauses on ${escapeHtml(p.deadlineDate)}. You can always come back and verify later, but you'll lose the resource library in the meantime.</p>
    `,
  },
  1: {
    subject: "Last day — your DOM access ends tomorrow",
    body: (p) => `
      <p style="color:#444; line-height:1.5;">${escapeHtml(p.firstName)} — Tomorrow's the deadline (${escapeHtml(p.deadlineDate)}).</p>
      <p style="color:#444; line-height:1.5;">Certified? Verify now — takes under a minute: ${link(p.verifyLink)}.</p>
      <p style="color:#444; line-height:1.5;">Not there yet? Keep your study access going on a paid plan so you don't lose progress: ${link(p.upgradeLink ?? p.verifyLink)}.</p>
      <p style="color:#444; line-height:1.5;">If neither happens, your account pauses tomorrow. Come back and verify any time after — nothing's deleted, just gated until you're licensed.</p>
    `,
  },
};

export function verificationDeadlineReminder(
  params: { pilotName: string; deadlineDate: string; resourcesLink: string; verifyLink: string; upgradeLink?: string },
  daysRemaining: 14 | 7 | 3 | 1
): TemplateResult {
  const tier = REMINDER_COPY[daysRemaining];
  return {
    subject: tier.subject,
    html: shell(tier.subject, tier.body({ firstName: firstNameOf(params.pilotName), deadlineDate: params.deadlineDate, resourcesLink: params.resourcesLink, verifyLink: params.verifyLink, upgradeLink: params.upgradeLink })),
  };
}

export function verificationDeadlineFinal(params: {
  pilotName: string;
  deadlineDate: string;
  verifyLink: string;
  upgradeLink: string;
}): TemplateResult {
  const firstName = firstNameOf(params.pilotName);
  return {
    subject: "Your DOM access has paused — two ways back in",
    html: shell(
      "Your free access window closed",
      `
        <p style="color:#444; line-height:1.5;">${escapeHtml(firstName)} — Your DOM membership deadline (${escapeHtml(params.deadlineDate)}) has passed without a verified Part 107 certificate on file, so resource access is now paused.</p>
        <p style="color:#444; line-height:1.5;">Two ways back in, any time:</p>
        <p style="color:#444; line-height:1.5;">1) Verified Pilot — submit your Part 107 certificate number: ${link(params.verifyLink)}.</p>
        <p style="color:#444; line-height:1.5;">2) Keep studying on a paid resource plan: ${link(params.upgradeLink)}.</p>
        <p style="color:#444; line-height:1.5;">Nothing's deleted — your account just stays gated until one of those happens.</p>
      `
    ),
  };
}
