import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification } from "@/lib/resend/client";
import { runMissionNotifications } from "@/lib/resend/missionNotifications";
import { certificationExpiring } from "@/lib/resend/templates";

// This existing daily cron now runs DOM's operational notifications as well
// as credential-expiration checks. Keeping one route avoids adding a third
// Vercel cron, so the production schedule remains compatible with the
// two-job Hobby limit.
const WINDOW_DAYS = 30;
const THROTTLE_DAYS = 25;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const today = new Date();
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);
    const todayStr = today.toISOString().slice(0, 10);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);

    const { data: contractors, error: contractorError } = await admin
      .from("contractors")
      .select("id,full_name,email,part107_expires_on,insurance_expires_on")
      .not("email", "is", null)
      .or(
        `and(part107_expires_on.gte.${todayStr},part107_expires_on.lte.${windowEndStr}),` +
        `and(insurance_expires_on.gte.${todayStr},insurance_expires_on.lte.${windowEndStr})`,
      );
    if (contractorError) throw new Error(`Certification query failed: ${contractorError.message}`);

    let certificationSent = 0;
    let certificationSkipped = 0;
    let certificationFailed = 0;
    for (const contractor of contractors ?? []) {
      const checks = [
        { certType: "part107", certName: "Part 107 Certificate", expiresOn: contractor.part107_expires_on },
        { certType: "insurance", certName: "Insurance Policy", expiresOn: contractor.insurance_expires_on },
      ];
      for (const check of checks) {
        if (!check.expiresOn || check.expiresOn < todayStr || check.expiresOn > windowEndStr) continue;
        const throttleSince = new Date(today);
        throttleSince.setDate(throttleSince.getDate() - THROTTLE_DAYS);
        const { data: recent, error: historyError } = await admin
          .from("notification_log")
          .select("id")
          .eq("email_type", "certification_expiring")
          .eq("recipient_entity_id", contractor.id)
          .contains("metadata", { certType: check.certType })
          .gte("created_at", throttleSince.toISOString())
          .limit(1);
        if (historyError) throw new Error(`Certification history query failed: ${historyError.message}`);
        if (recent?.length) {
          certificationSkipped++;
          continue;
        }
        const template = certificationExpiring({
          pilotName: contractor.full_name,
          certificationName: check.certName,
          expiresOn: check.expiresOn,
        });
        const sent = await sendNotification({
          to: contractor.email!,
          emailType: "certification_expiring",
          recipientType: "pilot",
          recipientEntityId: contractor.id,
          subject: template.subject,
          html: template.html,
          metadata: { certType: check.certType, expiresOn: check.expiresOn },
          idempotencyKey: `certification/${contractor.id}/${check.certType}/${check.expiresOn}`,
        });
        if (sent.success) certificationSent++;
        else certificationFailed++;
      }
    }

    const missions = await runMissionNotifications(today);
    return NextResponse.json({
      certifications: { checked: contractors?.length ?? 0, sent: certificationSent, skipped: certificationSkipped, failed: certificationFailed },
      missions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Daily notification run failed";
    console.error("daily notification cron error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
