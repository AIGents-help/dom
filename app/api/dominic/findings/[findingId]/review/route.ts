import { NextRequest, NextResponse } from "next/server";
import { deriveIssueTrackingKey, severityRank } from "@/lib/dominicIssueTracking";
import { deriveMaintenanceReviewPriority } from "@/lib/dominicMaintenanceReview";
import {
  nextProgressionMetadata,
  normalizeComparisonState,
  progressionEventType,
  progressionSummary,
} from "@/lib/dominicIssueProgression";
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
      reusedIssue: true,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const detector =
    finding.detector && typeof finding.detector === "object"
      ? (finding.detector as Record<string, unknown>)
      : {};
  const spatialAnchor =
    finding.spatial_anchor && typeof finding.spatial_anchor === "object"
      ? (finding.spatial_anchor as Record<string, unknown>)
      : {};
  const recommendedAction =
    typeof detector.recommendedAction === "string"
      ? detector.recommendedAction.slice(0, 1000)
      : null;
  const comparisonState = normalizeComparisonState(detector.comparisonState);
  const comparisonNote =
    typeof detector.comparisonNote === "string"
      ? detector.comparisonNote.slice(0, 700)
      : null;
  const mediaId = typeof detector.mediaId === "string" ? detector.mediaId : null;
  const issueKey = deriveIssueTrackingKey({
    findingType: finding.finding_type,
    title: finding.title,
    spatialAnchor,
    detector,
  });
  const linkedAt = new Date().toISOString();

  const { data: sourceInspection } = await admin
    .from("dominic_inspections")
    .select("ai_summary")
    .eq("id", finding.inspection_id)
    .eq("user_id", user.id)
    .eq("asset_id", finding.asset_id)
    .maybeSingle();
  const sourceInspectionSummary =
    sourceInspection?.ai_summary && typeof sourceInspection.ai_summary === "object"
      ? (sourceInspection.ai_summary as Record<string, unknown>)
      : {};
  const sourcePurpose =
    typeof sourceInspectionSummary.purpose === "string"
      ? sourceInspectionSummary.purpose
      : null;
  const targetedIssueId =
    (sourcePurpose === "issue_reinspection" ||
      sourcePurpose === "maintenance_verification") &&
    typeof sourceInspectionSummary.issueId === "string"
      ? sourceInspectionSummary.issueId
      : null;

  let previousIssue: {
    id: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    status: "open" | "monitoring" | "in_progress" | "resolved" | "verified" | "dismissed";
    confidence: number | null;
    recommended_action: string | null;
    metadata: Record<string, unknown> | null;
    first_seen_at: string;
    last_seen_at: string;
  } | null = null;

  if (targetedIssueId) {
    const { data: targetedIssue } = await admin
      .from("dominic_issues")
      .select("id,severity,status,confidence,recommended_action,metadata,first_seen_at,last_seen_at")
      .eq("id", targetedIssueId)
      .eq("user_id", user.id)
      .eq("asset_id", finding.asset_id)
      .in("status", ["open", "monitoring", "in_progress", "resolved"])
      .maybeSingle();
    previousIssue = targetedIssue as typeof previousIssue;
  }

  if (!previousIssue) {
    const { data: trackedIssue } = await admin
      .from("dominic_issues")
      .select("id,severity,status,confidence,recommended_action,metadata,first_seen_at,last_seen_at")
      .eq("user_id", user.id)
      .eq("asset_id", finding.asset_id)
      .eq("issue_key", issueKey)
      .in("status", ["open", "monitoring", "in_progress"])
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    previousIssue = trackedIssue as typeof previousIssue;
  }

  let issueId: string;
  let reusedIssue = false;
  let maintenanceReview: ReturnType<typeof deriveMaintenanceReviewPriority>;

  if (previousIssue) {
    issueId = previousIssue.id;
    reusedIssue = true;
    const severity =
      severityRank(finding.severity) > severityRank(previousIssue.severity)
        ? finding.severity
        : previousIssue.severity;
    const confidence =
      finding.confidence === null
        ? previousIssue.confidence
        : previousIssue.confidence === null
          ? finding.confidence
          : Math.max(finding.confidence, previousIssue.confidence);

    const previousMetadata =
      previousIssue.metadata && typeof previousIssue.metadata === "object"
        ? previousIssue.metadata as Record<string, unknown>
        : {};
    const progressionMetadata = {
      ...nextProgressionMetadata(previousMetadata, comparisonState),
      latestInspectionId: finding.inspection_id,
      latestSensorMode: finding.sensor_mode,
      latestLatitude: finding.latitude,
      latestLongitude: finding.longitude,
      latestSpatialAnchor: spatialAnchor,
      recurrenceCount:
        typeof previousMetadata.recurrenceCount === "number"
          ? previousMetadata.recurrenceCount + 1
          : 1,
      latestComparisonState: comparisonState,
      latestComparisonNote: comparisonNote,
    };
    maintenanceReview = deriveMaintenanceReviewPriority(
      {
        severity,
        status: previousIssue.status,
        firstSeenAt: previousIssue.first_seen_at,
        lastSeenAt: finding.observed_at,
        metadata: progressionMetadata,
      },
      new Date(linkedAt),
    );

    const { error: updateIssueError } = await admin
      .from("dominic_issues")
      .update({
        current_finding_id: finding.id,
        severity,
        confidence,
        recommended_action: recommendedAction ?? previousIssue.recommended_action,
        last_seen_at: finding.observed_at,
        metadata: {
          ...progressionMetadata,
          maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score,
          maintenanceReviewReasons: maintenanceReview.reasons,
          maintenanceReviewEvaluatedAt: linkedAt,
        },
      })
      .eq("id", issueId)
      .eq("user_id", user.id);

    if (updateIssueError) {
      return NextResponse.json({ error: "Existing issue could not be updated." }, { status: 500 });
    }
  } else {
    const initialMetadata = {
      source: "confirmed_finding",
      inspectionId: finding.inspection_id,
      latestInspectionId: finding.inspection_id,
      sensorMode: finding.sensor_mode,
      latitude: finding.latitude,
      longitude: finding.longitude,
      spatialAnchor,
      latestSpatialAnchor: spatialAnchor,
      recurrenceCount: 0,
      latestComparisonState: comparisonState,
      latestComparisonNote: comparisonNote,
    };
    maintenanceReview = deriveMaintenanceReviewPriority(
      {
        severity: finding.severity,
        status: "open",
        firstSeenAt: finding.observed_at,
        lastSeenAt: finding.observed_at,
        metadata: initialMetadata,
      },
      new Date(linkedAt),
    );

    const { data: issue, error: issueError } = await admin
      .from("dominic_issues")
      .insert({
        user_id: user.id,
        asset_id: finding.asset_id,
        first_finding_id: finding.id,
        current_finding_id: finding.id,
        issue_key: issueKey,
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
          ...initialMetadata,
          maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score,
          maintenanceReviewReasons: maintenanceReview.reasons,
          maintenanceReviewEvaluatedAt: linkedAt,
        },
      })
      .select("id")
      .single();

    if (issueError || !issue) {
      return NextResponse.json({ error: "Confirmed finding could not be converted into an issue." }, { status: 500 });
    }
    issueId = issue.id;
  }

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
        issue_id: issueId,
        finding_id: finding.id,
        inspection_id: finding.inspection_id,
        relation_type: reusedIssue ? "progression" : "discovered",
        linked_at: linkedAt,
      }),
    admin
      .from("dominic_issue_events")
      .insert({
        user_id: user.id,
        issue_id: issueId,
        inspection_id: finding.inspection_id,
        finding_id: finding.id,
        event_type: reusedIssue ? progressionEventType(comparisonState) : "confirmed",
        summary: reusedIssue
          ? progressionSummary({ title: finding.title, comparisonState })
          : `Finding confirmed by operator: ${finding.title}`,
        details: {
          issueKey,
          severity: finding.severity,
          confidence: finding.confidence,
          sensorMode: finding.sensor_mode,
          recurrence: reusedIssue,
          comparisonState,
          comparisonNote,
          maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score,
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
              spatialAnchor,
              issueKey,
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
      {
        error: reusedIssue
          ? "Issue was updated, but one or more evidence/history records could not be linked."
          : "Issue was created, but one or more evidence/history records could not be linked.",
      },
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
    issueId,
    issueKey,
    alreadyLinked: false,
    reusedIssue,
    comparisonState,
    progressionEvent: reusedIssue ? progressionEventType(comparisonState) : "confirmed",
    maintenanceReview,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
