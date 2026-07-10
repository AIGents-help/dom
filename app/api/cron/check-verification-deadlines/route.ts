import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { verificationDeadlineReminder, verificationDeadlineFinal } from "@/lib/resend/templates";

// GET /api/cron/check-verification-deadlines
// Runs daily (see vercel.json). Three things happen per unverified pilot
// with a membership_deadline, matching /api/cron/check-certifications'
// CRON_SECRET gate and notification_log throttle pattern:
//
// 1. Reminders at T-14/7/3/1. All four tiers share one email_type
//    (verification_deadline_reminder), so the throttle check MUST also
//    filter on metadata.daysRemaining — without it, the T-14 send would
//    make every later tier look "already notified" and never fire.
//    Uses "highest untriggered tier <= days-remaining" rather than exact
//    equality, so a skipped/delayed cron run doesn't permanently lose
//    whichever tier fell on the missed day.
// 2. Final two-path email exactly once at/after the deadline.
// 3. Auto-lock via a conditional UPDATE (not read-then-write) once the
//    grace period after the final email has elapsed with no verification
//    or resource-access subscription.

const REMINDER_TIERS = [14, 7, 3, 1] as const;
const GRACE_DAYS_AFTER_FINAL_NOTICE = 7;

function daysBetween(today: string, deadline: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(deadline).getTime() - new Date(today).getTime()) / msPerDay);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const todayStr = new Date().toISOString().slice(0, 10);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.droneopsman.com";

    const { data: contractors } = await admin
      .from("contractors")
      .select("id, full_name, email, membership_deadline, final_notice_sent_at, resource_access_active")
      .eq("part107_verified", false)
      .eq("resource_access_locked", false)
      .not("email", "is", null)
      .not("membership_deadline", "is", null);

    let remindersSent = 0;
    let remindersSkipped = 0;
    let finalsSent = 0;
    let locked = 0;

    for (const c of contractors ?? []) {
      const daysRemaining = daysBetween(todayStr, c.membership_deadline!);

      if (daysRemaining > 0) {
        // Scan tiers largest-to-smallest. A tier is "reached" once
        // daysRemaining has dropped to or below it. Send the largest
        // reached tier that hasn't already been logged, then stop — this
        // is NOT the same as taking the first tier daysRemaining is <=,
        // since that's always 14 (every value <=14 is also <=14); each
        // reached-but-already-sent tier must fall through to the next
        // smaller one, not just skip the whole contractor.
        for (const tier of REMINDER_TIERS) {
          if (daysRemaining > tier) continue; // tier not reached yet

          const { data: alreadySent } = await admin
            .from("notification_log")
            .select("id")
            .eq("email_type", "verification_deadline_reminder")
            .eq("recipient_entity_id", c.id)
            .contains("metadata", { daysRemaining: tier })
            .limit(1)
            .maybeSingle();

          if (alreadySent) {
            remindersSkipped++;
            continue;
          }

          const { subject, html } = verificationDeadlineReminder(
            {
              pilotName: c.full_name,
              deadlineDate: c.membership_deadline!,
              resourcesLink: `${siteUrl}/pilot/login`,
              verifyLink: `${siteUrl}/pilot/login`,
              upgradeLink: `${siteUrl}/pilot/login`,
            },
            tier
          );
          await sendNotification({
            to: c.email!,
            emailType: "verification_deadline_reminder",
            recipientType: "pilot",
            recipientEntityId: c.id,
            subject,
            html,
            metadata: { daysRemaining: tier },
          });
          remindersSent++;
          break;
        }
        continue;
      }

      // Deadline has passed.
      if (!c.final_notice_sent_at) {
        const { subject, html } = verificationDeadlineFinal({
          pilotName: c.full_name,
          deadlineDate: c.membership_deadline!,
          verifyLink: `${siteUrl}/pilot/login`,
          upgradeLink: `${siteUrl}/pilot/login`,
        });
        await sendNotification({
          to: c.email!,
          emailType: "verification_deadline_final",
          recipientType: "pilot",
          recipientEntityId: c.id,
          subject,
          html,
        });
        await admin.from("contractors").update({ final_notice_sent_at: new Date().toISOString() }).eq("id", c.id);
        finalsSent++;
        continue;
      }

      const graceElapsedMs = Date.now() - new Date(c.final_notice_sent_at).getTime();
      const graceDays = graceElapsedMs / (24 * 60 * 60 * 1000);
      if (graceDays >= GRACE_DAYS_AFTER_FINAL_NOTICE) {
        const { data: lockedRows } = await admin
          .from("contractors")
          .update({ resource_access_locked: true })
          .eq("id", c.id)
          .eq("part107_verified", false)
          .eq("resource_access_active", false)
          .select("id");
        if (lockedRows?.length) locked++;
      }
    }

    return NextResponse.json({
      checked: contractors?.length ?? 0,
      remindersSent,
      remindersSkipped,
      finalsSent,
      locked,
    });
  } catch (e: any) {
    console.error("check-verification-deadlines cron error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
