import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { certificationExpiring } from "@/lib/resend/templates";

// GET /api/cron/check-certifications
// Runs daily (see vercel.json). Finds contractors whose Part 107
// certificate or insurance policy expires within the next 30 days and
// sends the certificationExpiring email — throttled via notification_log
// so the same contractor+cert-type pair isn't re-notified more than once
// every ~25 days while it stays in the warning window.
//
// Gated by CRON_SECRET, matching Vercel's documented pattern: when that
// env var is set, Vercel Cron automatically sends
// `Authorization: Bearer $CRON_SECRET` on the scheduled request.

const WINDOW_DAYS = 30;
const THROTTLE_DAYS = 25;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const today = new Date();
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);
    const todayStr = today.toISOString().slice(0, 10);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);

    const { data: contractors } = await admin
      .from("contractors")
      .select("id, full_name, email, part107_expires_on, insurance_expires_on")
      .not("email", "is", null)
      .or(
        `and(part107_expires_on.gte.${todayStr},part107_expires_on.lte.${windowEndStr}),` +
        `and(insurance_expires_on.gte.${todayStr},insurance_expires_on.lte.${windowEndStr})`
      );

    let sent = 0;
    let skipped = 0;

    for (const c of contractors ?? []) {
      const checks: { certType: string; certName: string; expiresOn: string | null }[] = [
        { certType: "part107", certName: "Part 107 Certificate", expiresOn: c.part107_expires_on },
        { certType: "insurance", certName: "Insurance Policy", expiresOn: c.insurance_expires_on },
      ];

      for (const check of checks) {
        if (!check.expiresOn || check.expiresOn < todayStr || check.expiresOn > windowEndStr) continue;

        const throttleSince = new Date();
        throttleSince.setDate(throttleSince.getDate() - THROTTLE_DAYS);
        const { data: recent } = await admin
          .from("notification_log")
          .select("id")
          .eq("email_type", "certification_expiring")
          .eq("recipient_entity_id", c.id)
          .contains("metadata", { certType: check.certType })
          .gte("created_at", throttleSince.toISOString())
          .limit(1)
          .maybeSingle();

        if (recent) { skipped++; continue; }

        const { subject, html } = certificationExpiring({
          pilotName: c.full_name,
          certificationName: check.certName,
          expiresOn: check.expiresOn,
        });

        await sendNotification({
          to: c.email!,
          emailType: "certification_expiring",
          recipientType: "pilot",
          recipientEntityId: c.id,
          subject,
          html,
          metadata: { certType: check.certType, expiresOn: check.expiresOn },
        });
        sent++;
      }
    }

    return NextResponse.json({ checked: contractors?.length ?? 0, sent, skipped });
  } catch (e: any) {
    console.error("check-certifications cron error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
