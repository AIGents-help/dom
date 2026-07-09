import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { sendNotification, type EmailType, type RecipientType } from "@/lib/resend/client";
import * as templates from "@/lib/resend/templates";

// POST /api/dev/test-email  { emailType, to }
// Fires a real send through the full sendNotification() + notification_log
// path with placeholder data, so delivery and webhook reconciliation can be
// verified without waiting for a real mission to reach that lifecycle
// stage. Gated behind an admin session OR a shared secret header (for
// curl-based testing without a browser session) — set DEV_TEST_EMAIL_SECRET
// to enable the header path; it's unset by default, so only admin auth
// works until you opt in.

const PLACEHOLDERS: Record<string, { recipientType: RecipientType; build: () => { subject: string; html: string } }> = {
  booking_confirmation: {
    recipientType: "customer",
    build: () =>
      templates.bookingConfirmation({
        clientName: "Jamie Client",
        missionTitle: "Riverside Roof Survey",
        serviceType: "roof_inspection_commercial",
        location: "123 Main St, Springfield",
        scheduledDate: "July 15, 2026",
        totalCents: 45000,
      }),
  },
  deliverable_ready: {
    recipientType: "customer",
    build: () =>
      templates.deliverableReady({
        clientName: "Jamie Client",
        missionTitle: "Riverside Roof Survey",
        deliverableUrl: "https://example.com/deliverables/test",
      }),
  },
  invoice_sent: {
    recipientType: "customer",
    build: () =>
      templates.invoiceSent({
        clientName: "Jamie Client",
        amountCents: 45000,
        invoiceUrl: "https://example.com/invoices/test",
        dueDate: "July 22, 2026",
      }),
  },
  mission_available: {
    recipientType: "pilot",
    build: () =>
      templates.missionAvailable({
        pilotName: "Alex Pilot",
        missionTitle: "Riverside Roof Survey",
        serviceType: "roof_inspection_commercial",
        location: "123 Main St, Springfield",
        payoutCents: 36000,
      }),
  },
  mission_briefing_ready: {
    recipientType: "pilot",
    build: () =>
      templates.missionBriefingReady({
        pilotName: "Alex Pilot",
        missionTitle: "Riverside Roof Survey",
        briefingUrl: "https://example.com/admin/missions/test/briefing",
      }),
  },
  payout_initiated: {
    recipientType: "pilot",
    build: () =>
      templates.payoutInitiated({
        pilotName: "Alex Pilot",
        amountCents: 36000,
        expectedArrivalDate: "July 18, 2026",
      }),
  },
  mission_reminder_24h: {
    recipientType: "pilot",
    build: () =>
      templates.missionReminder24h({
        pilotName: "Alex Pilot",
        missionTitle: "Riverside Roof Survey",
        scheduledDate: "July 15, 2026",
        location: "123 Main St, Springfield",
      }),
  },
  mission_completed: {
    recipientType: "customer",
    build: () =>
      templates.missionCompleted({
        clientName: "Jamie Client",
        missionTitle: "Riverside Roof Survey",
      }),
  },
  mission_rescheduled: {
    recipientType: "customer",
    build: () =>
      templates.missionRescheduled({
        clientName: "Jamie Client",
        missionTitle: "Riverside Roof Survey",
        newScheduledDate: "July 18, 2026",
      }),
  },
  mission_assigned: {
    recipientType: "pilot",
    build: () =>
      templates.missionAssigned({
        pilotName: "Alex Pilot",
        missionTitle: "Riverside Roof Survey",
        scheduledDate: "July 15, 2026",
      }),
  },
  deliverable_submission_reminder: {
    recipientType: "pilot",
    build: () =>
      templates.deliverableSubmissionReminder({
        pilotName: "Alex Pilot",
        missionTitle: "Riverside Roof Survey",
      }),
  },
  payout_completed: {
    recipientType: "pilot",
    build: () =>
      templates.payoutCompleted({
        pilotName: "Alex Pilot",
        amountCents: 36000,
      }),
  },
  certification_expiring: {
    recipientType: "pilot",
    build: () =>
      templates.certificationExpiring({
        pilotName: "Alex Pilot",
        certificationName: "Part 107 Certificate",
        expiresOn: "August 1, 2026",
      }),
  },
};

export async function POST(req: NextRequest) {
  const devSecret = process.env.DEV_TEST_EMAIL_SECRET;
  const headerSecret = req.headers.get("x-dev-secret");
  const authorizedBySecret = !!devSecret && headerSecret === devSecret;

  if (!authorizedBySecret && !(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { emailType, to } = (await req.json()) as { emailType?: string; to?: string };
    if (!emailType || !to) {
      return NextResponse.json({ error: "emailType and to are required" }, { status: 400 });
    }

    const entry = PLACEHOLDERS[emailType];
    if (!entry) {
      return NextResponse.json(
        { error: `No template wired for emailType "${emailType}". Available: ${Object.keys(PLACEHOLDERS).join(", ")}` },
        { status: 400 }
      );
    }

    const { subject, html } = entry.build();
    const result = await sendNotification({
      to,
      emailType: emailType as EmailType,
      recipientType: entry.recipientType,
      subject: `[TEST] ${subject}`,
      html,
      metadata: { test: true },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("dev/test-email error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
