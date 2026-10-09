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
  if (!body || (body.action !== "confirm" && body.action !== "dismiss")) {
    return NextResponse.json({ error: "action must be confirm or dismiss" }, { status: 400 });
  }

  const save = async (plan: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin.rpc("commit_dominic_finding_review", {
      p_finding_id: findingId, p_user_id: user.id, p_action: body.action, p_plan: plan,
    });
    if (error || !data) return NextResponse.json({ error: "Review result could not be verified. Refresh and retry." }, { status: 500 });
    if (data.notFound) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    if (data.retry) return null;
    return NextResponse.json(data.alreadyLinked ? data : { ...extra, ...data }, { headers: { "Cache-Control": "no-store" } });
  };
  const attemptReview = async () => {
    const { data: finding, error: findingError } = await admin
      .from("dominic_findings")
      .select("id,user_id,inspection_id,asset_id,finding_type,title,description,severity,review_status,confidence,sensor_mode,fingerprint,latitude,longitude,spatial_anchor,detector,observed_at,updated_at")
      .eq("id", findingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findingError) {
      return NextResponse.json({ error: "Finding could not be loaded." }, { status: 500 });
    }
    if (!finding) {
      return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    }

    if (body.action === "dismiss") return save();
    const { data: existingLink, error: linkError } = await admin.from("dominic_issue_findings")
      .select("issue_id").eq("finding_id", finding.id).eq("user_id", user.id).limit(1).maybeSingle();
    if (linkError) return NextResponse.json({ error: "Finding links could not be loaded." }, { status: 500 });
    if (existingLink?.issue_id) return save();

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
    const issueKey = deriveIssueTrackingKey({
      findingType: finding.finding_type,
      title: finding.title,
      spatialAnchor,
      detector,
    });
    const linkedAt = new Date().toISOString();

    const { data: sourceInspection, error: inspectionError } = await admin
      .from("dominic_inspections")
      .select("ai_summary,updated_at")
      .eq("id", finding.inspection_id)
      .eq("user_id", user.id)
      .eq("asset_id", finding.asset_id)
      .maybeSingle();
    if (inspectionError) return NextResponse.json({ error: "Inspection could not be loaded." }, { status: 500 });
    if (!sourceInspection) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
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

    type PreviousIssueRow = {
      id: string;
      severity: "info" | "low" | "medium" | "high" | "critical";
      status: "open" | "monitoring" | "in_progress" | "resolved" | "verified" | "dismissed";
      confidence: number | null;
      recommended_action: string | null;
      metadata: Record<string, unknown> | null;
      first_seen_at: string;
      last_seen_at: string;
      updated_at: string;
    };
    let previousIssue: PreviousIssueRow | null = null;

    if (targetedIssueId) {
      const { data: targetedIssue, error: targetedError } = await admin
        .from("dominic_issues")
        .select("id,severity,status,confidence,recommended_action,metadata,first_seen_at,last_seen_at,updated_at")
        .eq("id", targetedIssueId)
        .eq("user_id", user.id)
        .eq("asset_id", finding.asset_id)
        .in("status", ["open", "monitoring", "in_progress", "resolved"])
        .maybeSingle();
      if (targetedError) return NextResponse.json({ error: "Targeted issue could not be loaded." }, { status: 500 });
      previousIssue = targetedIssue as PreviousIssueRow | null;
    }

    if (!previousIssue) {
      const { data: trackedIssue, error: trackedError } = await admin
        .from("dominic_issues")
        .select("id,severity,status,confidence,recommended_action,metadata,first_seen_at,last_seen_at,updated_at")
        .eq("user_id", user.id)
        .eq("asset_id", finding.asset_id)
        .eq("issue_key", issueKey)
        .in("status", ["open", "monitoring", "in_progress"])
        .order("last_seen_at", { ascending: false })
        .order("id")
        .limit(1)
        .maybeSingle();
      if (trackedError) return NextResponse.json({ error: "Tracked issue could not be loaded." }, { status: 500 });
      previousIssue = trackedIssue as PreviousIssueRow | null;
    }

    let issueValues: Record<string, unknown>;
    let reusedIssue = false;
    let maintenanceReview: ReturnType<typeof deriveMaintenanceReviewPriority>;

    if (previousIssue) {
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

      issueValues = {
        severity, confidence, recommended_action: recommendedAction ?? previousIssue.recommended_action,
        metadata: { ...progressionMetadata, maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score, maintenanceReviewReasons: maintenanceReview.reasons,
          maintenanceReviewEvaluatedAt: linkedAt },
      };
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

      issueValues = {
        severity: finding.severity, confidence: finding.confidence, recommended_action: recommendedAction,
        metadata: { ...initialMetadata, maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score, maintenanceReviewReasons: maintenanceReview.reasons,
          maintenanceReviewEvaluatedAt: linkedAt },
      };
    }

    return save({
      expectedFindingUpdatedAt: finding.updated_at,
      expectedInspectionUpdatedAt: sourceInspection.updated_at,
      expectedIssueId: previousIssue?.id ?? null, expectedIssueUpdatedAt: previousIssue?.updated_at ?? null,
      targetedIssueId, issueKey, linkedAt, issueValues,
      event: {
        event_type: reusedIssue ? progressionEventType(comparisonState) : "confirmed",
        summary: reusedIssue ? progressionSummary({ title: finding.title, comparisonState }) : `Finding confirmed by operator: ${finding.title}`,
        details: { issueKey, severity: finding.severity, confidence: finding.confidence, sensorMode: finding.sensor_mode,
          recurrence: reusedIssue, comparisonState, comparisonNote, maintenanceReviewPriority: maintenanceReview.priority,
          maintenanceReviewScore: maintenanceReview.score },
      },
    }, { issueKey, comparisonState, progressionEvent: reusedIssue ? progressionEventType(comparisonState) : "confirmed", maintenanceReview });
  };
  // Recompute the plan when another confirmation changed its source records.
  // No writes occur before the database accepts a consistent plan.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await attemptReview();
    if (result) return result;
  }
  return NextResponse.json({ error: "The inspection changed during review. Refresh and retry." }, { status: 409 });
}
