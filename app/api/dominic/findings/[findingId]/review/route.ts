import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ReviewAction = "confirm" | "dismiss";

const conditionRank: Record<string, number> = {
  unknown: 0,
  normal: 1,
  watch: 2,
  degraded: 3,
  critical: 4,
};

function conditionForSeverity(severity: string) {
  if (severity === "critical") return "critical";
  if (severity === "high") return "degraded";
  if (severity === "medium") return "watch";
  return null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await context.params;
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  let body: { action?: ReviewAction };
  try {
    body = (await req.json()) as { action?: ReviewAction };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.action !== "confirm" && body.action !== "dismiss") {
    return NextResponse.json({ error: "action must be confirm or dismiss" }, { status: 400 });
  }

  const { data: finding, error: findingError } = await admin
    .from("dominic_findings")
    .select("id,user_id,inspection_id,asset_id,finding_type,title,description,severity,review_status,confidence,sensor_mode,fingerprint,latitude,longitude,spatial_anchor,detector,observed_at")
    .eq("id", findingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findingError) {
    return NextResponse.json({ error: "Finding could not be loaded." }, { status: 500 });
  }
  if (!finding) {
    return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  }

  if (body.action === "dismiss") {
    const { error } = await admin
      .from("dominic_findings")
      .update({ review_status: "dismissed" })
      .eq("id", finding.id)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ error: "Finding could not be dismissed." }, { status: 500 });
    }
    return NextResponse.json({ findingId: finding.id, status: "dismissed" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: existingLink } = await admin
    .from("dominic_issue_findings")
    .select("issue_id")
    .eq("finding_id", finding.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingLink?.issue_id) {
    await admin
      .from("dominic_findings")
      .update({ review_status: "confirmed" })
      .eq("id", finding.id)
      .eq("user_id", user.id);
    return NextResponse.json({
      findingId: finding.id,
      status: "confirmed",
      issueId: existingLink.issue_id,
      alreadyLinked: true,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const detector =
    finding.detector && typeof finding.detector === "object"
      ? (finding.detector as Record<string, unknown>)
      : {};
  const recommendedAction =
    typeof detector.recommendedAction === "string"
      ? detector.recommendedAction.slice(0, 1000)
      : null;
  const mediaId = typeof detector.mediaId === "string" ? detector.mediaId : null;

  const { data: issue, error: issueError } = await admin
    .from("dominic_issues")
    .insert({
      user_id: user.id,
      asset_id: finding.asset_id,
      first_finding_id: finding.id,
      current_finding_id: finding.id,
      issue_type: finding.finding_type,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      status: "open",
      confidence: finding.confidence,
      recommended_action: recommendedAction,
      first_seen_at: finding.observed_at,
      last_seen_at: finding.observed_at,
      metadata: {
        source: "confirmed_finding",
        inspectionId: finding.inspection_id,
        sensorMode: finding.sensor_mode,
        latitude: finding.latitude,
        longitude: finding.longitude,
        spatialAnchor: finding.spatial_anchor,
      },
    })
    .select("id")
    .single();

  if (issueError || !issue) {
    return NextResponse.json({ error: "Confirmed finding could not be converted into an issue." }, { status: 500 });
  }

  const linkedAt = new Date().toISOString();
  const writes: Array<PromiseLike<unknown>> = [
    admin
      .from("dominic_findings")
      .update({ review_status: "confirmed" })
      .eq("id", finding.id)
      .eq("user_id", user.id),
    admin
      .from("dominic_issue_findings")
      .insert({
        user_id: user.id,
        issue_id: issue.id,
        finding_id: finding.id,
        inspection_id: finding.inspection_id,
        relation_type: "discovered",
        linked_at: linkedAt,
      }),
    admin
      .from("dominic_issue_events")
      .insert({
        user_id: user.id,
        issue_id: issue.id,
        inspection_id: finding.inspection_id,
        finding_id: finding.id,
        event_type: "confirmed",
        summary: `Finding confirmed by operator: ${finding.title}`,
        details: {
          severity: finding.severity,
          confidence: finding.confidence,
          sensorMode: finding.sensor_mode,
        },
      }),
  ];

  if (mediaId) {
    const { data: media } = await admin
      .from("dominic_inspection_media")
      .select("id,storage_path,mime_type,captured_at,metadata")
      .eq("id", mediaId)
      .eq("user_id", user.id)
      .eq("inspection_id", finding.inspection_id)
      .eq("asset_id", finding.asset_id)
      .maybeSingle();

    if (media) {
      writes.push(
        admin
          .from("dominic_finding_evidence")
          .insert({
            user_id: user.id,
            finding_id: finding.id,
            evidence_type: finding.sensor_mode ?? "image",
            storage_path: media.storage_path,
            source_table: "dominic_inspection_media",
            source_id: media.id,
            mime_type: media.mime_type,
            captured_at: media.captured_at,
            metadata: {
              ...(media.metadata && typeof media.metadata === "object" ? media.metadata : {}),
              spatialAnchor: finding.spatial_anchor,
            },
          }),
      );
    }
  }

  const results = await Promise.all(writes);
  const writeError = results
    .map((result) => result as { error?: { message?: string } | null })
    .find((result) => result?.error)?.error;
  if (writeError) {
    return NextResponse.json(
      { error: "Issue was created, but one or more evidence/history records could not be linked." },
      { status: 500 },
    );
  }

  const desiredCondition = conditionForSeverity(finding.severity);
  if (desiredCondition) {
    const { data: asset } = await admin
      .from("dominic_assets")
      .select("condition_state")
      .eq("id", finding.asset_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      asset &&
      (conditionRank[desiredCondition] ?? 0) > (conditionRank[asset.condition_state] ?? 0)
    ) {
      await admin
        .from("dominic_assets")
        .update({
          condition_state: desiredCondition,
          condition_updated_at: linkedAt,
        })
        .eq("id", finding.asset_id)
        .eq("user_id", user.id);
    }
  }

  return NextResponse.json({
    findingId: finding.id,
    status: "confirmed",
    issueId: issue.id,
    alreadyLinked: false,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
