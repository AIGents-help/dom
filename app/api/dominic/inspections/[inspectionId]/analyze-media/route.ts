import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isOwnedInspectionStoragePath } from "@/lib/dominicInspectionEvidence";
import { buildFollowUpCapturePrescription } from "@/lib/dominicFollowUpCapture";
import {
  rangefinderTargetMatchesRegion,
  readStoredRangefinderTarget,
} from "@/lib/aircraft/rangefinderTarget";
import { resolveDominicInspectionProfile } from "@/lib/dominicInspectionProfiles";
import { describeRadiometricCapture, normalizeRadiometricCapture } from "@/lib/dominicThermal";
import {
  effectiveComparisonState,
  evaluateComparisonComparability,
  type ComparisonCaptureGeometry,
} from "@/lib/dominicComparisonComparability";
import {
  buildDominicVisionPrompt,
  DOMINIC_VISION_SCHEMA,
  extractResponsesApiText,
  parseDominicVisionScreening,
} from "@/lib/dominicVision";

export const runtime = "nodejs";
export const maxDuration = 180;

function fingerprint(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
}

function optionalFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function captureGeometryFromMedia(input: {
  relative_altitude_ft?: number | null;
  metadata?: unknown;
}): ComparisonCaptureGeometry {
  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : {};
  const cameraSource =
    metadata.cameraSource === "wide" || metadata.cameraSource === "zoom"
      ? metadata.cameraSource
      : null;
  const zoomRatio = optionalFiniteNumber(metadata.zoomRatio);
  const focusTarget =
    metadata.focusTarget && typeof metadata.focusTarget === "object"
      ? (metadata.focusTarget as Record<string, unknown>)
      : null;
  const focusX = optionalFiniteNumber(focusTarget?.x);
  const focusY = optionalFiniteNumber(focusTarget?.y);
  const aeLocked = typeof metadata.aeLocked === "boolean" ? metadata.aeLocked : null;
  const headingDeg = optionalFiniteNumber(metadata.headingDeg);
  const gimbalPitchDeg = optionalFiniteNumber(metadata.gimbalPitchDeg);
  const relativeAltitudeFt = optionalFiniteNumber(input.relative_altitude_ft);
  return {
    relativeAltitudeFt,
    headingDeg,
    gimbalPitchDeg,
    cameraSource,
    zoomRatio,
    focusTarget:
      focusX !== null && focusY !== null
        ? { x: focusX, y: focusY }
        : null,
    aeLocked,
  };
}

function safeProviderError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Vision provider request failed.";
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.slice(0, 500);
  }
  return "Vision provider request failed.";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ inspectionId: string }> },
) {
  const { inspectionId } = await context.params;
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

  let body: { mediaId?: string };
  try {
    body = (await req.json()) as { mediaId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.mediaId) {
    return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
  }

  const { data: media, error: mediaError } = await admin
    .from("dominic_inspection_media")
    .select("id,user_id,inspection_id,asset_id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,latitude,longitude,relative_altitude_ft,analysis_status,metadata")
    .eq("id", body.mediaId)
    .eq("inspection_id", inspectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (mediaError) {
    return NextResponse.json({ error: "Inspection media could not be loaded." }, { status: 500 });
  }
  if (!media) {
    return NextResponse.json({ error: "Inspection media not found." }, { status: 404 });
  }
  if (media.media_type !== "image" || !media.storage_path) {
    return NextResponse.json({ error: "This evidence item is not an analyzable image." }, { status: 422 });
  }
  if (!isOwnedInspectionStoragePath(media.storage_path, user.id)) {
    return NextResponse.json({ error: "Inspection media path is invalid." }, { status: 422 });
  }

  const [{ data: inspection, error: inspectionError }, { data: asset, error: assetError }] =
    await Promise.all([
      admin
        .from("dominic_inspections")
        .select("id,user_id,asset_id,inspection_type,objective,status,sensor_modes,baseline_inspection_id,ai_summary")
        .eq("id", inspectionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("dominic_assets")
        .select("id,user_id,name,asset_type")
        .eq("id", media.asset_id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (inspectionError || assetError) {
    return NextResponse.json({ error: "Inspection context could not be loaded." }, { status: 500 });
  }
  if (!inspection || !asset || inspection.asset_id !== asset.id) {
    return NextResponse.json({ error: "Inspection context is invalid." }, { status: 409 });
  }

  const completedResponse = async (summary: Record<string, unknown>, cached = false) => {
    const { data: findings, error } = await admin.from("dominic_findings")
      .select("id,finding_type,title,description,severity,review_status,confidence,sensor_mode,fingerprint,spatial_anchor,detector,observed_at")
      .eq("user_id", user.id).eq("inspection_id", inspection.id)
      .eq("review_status", "needs_review").order("observed_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Screening results could not be loaded. Retry to retrieve saved results." }, { status: 500 });
    return NextResponse.json({ configured: true, mediaId: media.id, ...summary, cached, findings: findings ?? [] },
      { headers: { "Cache-Control": "no-store" } });
  };
  const busyResponse = (leaseExpiresAt: string) => NextResponse.json({
    code: "SCREENING_IN_PROGRESS", error: "This image is already being screened. Wait for the result or retry after the attempt expires.",
    leaseExpiresAt,
  }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const { data: existingJob, error: jobError } = await admin.from("dominic_media_screening_jobs")
    .select("status,lease_expires_at,result").eq("media_id", media.id).eq("user_id", user.id).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Screening state could not be loaded." }, { status: 500 });
  if (existingJob?.status === "succeeded") return completedResponse(existingJob.result, true);
  if (existingJob?.status === "processing" && Date.parse(existingJob.lease_expires_at) > Date.now()) {
    return busyResponse(existingJob.lease_expires_at);
  }

  const vercelGatewayToken =
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_AI_GATEWAY_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const provider = vercelGatewayToken ? "vercel-ai-gateway" : openAiKey ? "openai" : null;
  const providerToken = vercelGatewayToken || openAiKey;
  const providerUrl = vercelGatewayToken
    ? "https://ai-gateway.vercel.sh/v1/responses"
    : "https://api.openai.com/v1/responses";

  if (!provider || !providerToken) {
    return NextResponse.json(
      {
        error: "DOMINIC AI screening is not configured on this deployment.",
        code: "VISION_NOT_CONFIGURED",
        configured: false,
      },
      { status: 503 },
    );
  }

  const { data: signed, error: signedError } = await admin.storage
    .from("dominic-inspection-evidence")
    .createSignedUrl(media.storage_path, 300);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Inspection evidence could not be opened for analysis." }, { status: 502 });
  }

  const aiSummary =
    inspection.ai_summary && typeof inspection.ai_summary === "object"
      ? (inspection.ai_summary as Record<string, unknown>)
      : {};
  const issueId =
    typeof aiSummary.issueId === "string" && aiSummary.issueId.trim()
      ? aiSummary.issueId
      : null;

  let baselineSignedUrl: string | null = null;
  let baselineFindingId: string | null = null;
  let baselineEvidenceId: string | null = null;
  let baselineSourceMediaId: string | null = null;
  let baselineMediaGeometry: ComparisonCaptureGeometry | null = null;

  if (issueId) {
    const { data: issue } = await admin
      .from("dominic_issues")
      .select("id,current_finding_id")
      .eq("id", issueId)
      .eq("user_id", user.id)
      .eq("asset_id", asset.id)
      .maybeSingle();

    if (issue?.current_finding_id) {
      baselineFindingId = issue.current_finding_id;
      const { data: evidence } = await admin
        .from("dominic_finding_evidence")
        .select("id,storage_path,mime_type,source_id")
        .eq("user_id", user.id)
        .eq("finding_id", issue.current_finding_id)
        .not("storage_path", "is", null)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isOwnedInspectionStoragePath(evidence?.storage_path, user.id) && evidence?.mime_type?.startsWith("image/")) {
        const { data: baselineSigned } = await admin.storage
          .from("dominic-inspection-evidence")
          .createSignedUrl(evidence.storage_path, 300);
        if (baselineSigned?.signedUrl) {
          baselineSignedUrl = baselineSigned.signedUrl;
          baselineEvidenceId = evidence.id;
          baselineSourceMediaId =
            typeof evidence.source_id === "string" ? evidence.source_id : null;
        }
      }
    }
  }

  if (baselineSourceMediaId) {
    const { data: baselineMedia } = await admin
      .from("dominic_inspection_media")
      .select("id,user_id,asset_id,relative_altitude_ft,metadata")
      .eq("id", baselineSourceMediaId)
      .eq("user_id", user.id)
      .eq("asset_id", asset.id)
      .maybeSingle();
    if (baselineMedia) {
      baselineMediaGeometry = captureGeometryFromMedia(baselineMedia);
    }
  }

  const comparisonComparability = baselineSignedUrl
    ? evaluateComparisonComparability({
        baseline: baselineMediaGeometry ?? {},
        current: captureGeometryFromMedia(media),
      })
    : null;

  const comparisonLimitations = comparisonComparability?.limitations ?? [];

  const mediaMetadata =
    media.metadata && typeof media.metadata === "object"
      ? (media.metadata as Record<string, unknown>)
      : {};
  const radiometric = normalizeRadiometricCapture(mediaMetadata.radiometric);
  const thermalEvidenceKind =
    media.sensor_mode === "thermal"
      ? radiometric
        ? "radiometric"
        : "thermal_image_only"
      : radiometric
        ? "radiometric"
        : null;

  const model =
    process.env.DOMINIC_VISION_MODEL?.trim() ||
    (provider === "vercel-ai-gateway" ? "openai/gpt-5.6-terra" : "gpt-5.6-terra");
  const inspectionProfile = resolveDominicInspectionProfile({
    assetType: asset.asset_type,
    inspectionType: inspection.inspection_type,
  });
  const prompt = buildDominicVisionPrompt({
    assetName: asset.name,
    assetType: asset.asset_type,
    inspectionType: inspection.inspection_type,
    objective: inspection.objective,
    sensorMode: media.sensor_mode,
    baselineAvailable: Boolean(baselineSignedUrl),
    comparisonComparability,
  });

  const { data: claim, error: claimError } = await admin.rpc("claim_dominic_media_screening", {
    p_media_id: media.id, p_user_id: user.id,
  });
  if (claimError || !claim) return NextResponse.json({ error: "Screening attempt could not be started." }, { status: 500 });
  if (claim.decision === "cached") return completedResponse(claim.result, true);
  if (claim.decision === "busy") return busyResponse(claim.leaseExpiresAt);
  if (claim.decision !== "claimed" || !claim.runId) return NextResponse.json({ error: "Invalid screening attempt." }, { status: 500 });

  try {
    const response = await fetch(providerUrl, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              ...((media.sensor_mode === "thermal" || radiometric)
                ? [{ type: "input_text" as const, text: describeRadiometricCapture(radiometric) }]
                : []),
              ...(baselineSignedUrl
                ? [{ type: "input_image" as const, image_url: baselineSignedUrl, detail: "high" as const }]
                : []),
              { type: "input_image", image_url: signed.signedUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "dominic_visual_screening",
            strict: true,
            schema: DOMINIC_VISION_SCHEMA,
          },
        },
        store: false,
        max_output_tokens: 2400,
        ...(provider === "vercel-ai-gateway"
          ? {
              providerOptions: {
                gateway: {
                  disallowPromptTraining: true,
                },
              },
            }
          : {}),
      }),
    });

    const providerPayload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(safeProviderError(providerPayload));
    }

    const screening = parseDominicVisionScreening(extractResponsesApiText(providerPayload));
    const storedRangefinderTarget = readStoredRangefinderTarget(media.metadata);
    const candidateRows = screening.candidates.map((candidate) => {
      const candidateFingerprint = `vision:${media.id}:${fingerprint([
        candidate.finding_type,
        candidate.tracking_key || candidate.title.toLowerCase(),
        candidate.title.toLowerCase(),
        candidate.description.toLowerCase(),
      ].join("|"))}`;
      const laserCorrelated =
        storedRangefinderTarget !== null &&
        candidate.region !== null &&
        rangefinderTargetMatchesRegion(storedRangefinderTarget, candidate.region);
      const targetLocation = laserCorrelated ? storedRangefinderTarget : null;
      const rawComparisonState = candidate.comparison_state;
      const comparisonState = effectiveComparisonState(
        rawComparisonState,
        comparisonComparability,
      );
      const comparisonNote =
        comparisonState !== rawComparisonState
          ? `${candidate.comparison_note} DOMINIC marked this comparison uncertain because capture geometry is poorly matched.`.trim()
          : candidate.comparison_note;
      const followUpCapture = buildFollowUpCapturePrescription({
        region: candidate.region,
        confidence: candidate.confidence,
        comparisonState,
        targetLocation: targetLocation
          ? {
              latitude: targetLocation.latitude,
              longitude: targetLocation.longitude,
              distanceM: targetLocation.distanceM,
            }
          : null,
      });

      return {
        user_id: user.id,
        inspection_id: inspection.id,
        asset_id: asset.id,
        finding_type: candidate.finding_type,
        title: candidate.title,
        description: candidate.description,
        severity: candidate.severity,
        review_status: "needs_review",
        confidence: candidate.confidence,
        sensor_mode: media.sensor_mode,
        fingerprint: candidateFingerprint,
        latitude: targetLocation?.latitude ?? media.latitude,
        longitude: targetLocation?.longitude ?? media.longitude,
        spatial_anchor: {
          mediaId: media.id,
          imageRegion: candidate.region,
          captureLocation: {
            latitude: media.latitude,
            longitude: media.longitude,
            relativeAltitudeFt: media.relative_altitude_ft,
          },
          rangefinderTarget: storedRangefinderTarget,
          targetLocation: targetLocation
            ? {
                ...targetLocation,
                source: "laser_rangefinder",
              }
            : null,
          targetLocationSource: targetLocation ? "laser_rangefinder" : "capture_position",
        },
        detector: {
          provider,
          model,
          inspectionProfileId: inspectionProfile.id,
          inspectionProfileLabel: inspectionProfile.label,
          mediaId: media.id,
          candidate: true,
          recommendedAction: candidate.recommended_action,
          trackingKey: candidate.tracking_key || null,
          comparisonState,
          rawComparisonState,
          comparisonNote,
          comparisonComparability,
          baselineFindingId,
          baselineEvidenceId,
          baselineSourceMediaId,
          screeningSummary: screening.summary,
          limitations: [...screening.limitations, ...comparisonLimitations],
          thermalEvidenceKind,
          radiometric,
          followUpCapture,
        },
        observed_at: media.captured_at ?? new Date().toISOString(),
      };
    });

    const summary = {
      provider, model, inspectionProfileId: inspectionProfile.id,
      inspectionProfileLabel: inspectionProfile.label, summary: screening.summary,
      candidateCount: screening.candidates.length,
      limitations: [...screening.limitations, ...comparisonLimitations],
      thermalEvidenceKind, radiometric, baselineCompared: Boolean(baselineSignedUrl),
      baselineFindingId, baselineEvidenceId, baselineSourceMediaId, comparisonComparability,
      analyzedAt: new Date().toISOString(),
    };
    const { data: finished, error: finishError } = await admin.rpc("finish_dominic_media_screening", {
      p_media_id: media.id, p_user_id: user.id, p_run_id: claim.runId,
      p_summary: summary, p_candidates: candidateRows,
    });
    if (finishError) throw finishError;
    if (!finished) return NextResponse.json({ code: "SCREENING_ATTEMPT_EXPIRED", error: "This screening attempt expired. Reload evidence and retry if needed." }, { status: 409 });
    return completedResponse(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision screening failed.";
    await admin.rpc("finish_dominic_media_screening", {
      p_media_id: media.id, p_user_id: user.id, p_run_id: claim.runId,
      p_summary: { provider, model, failedAt: new Date().toISOString(), error: message.slice(0, 500) },
      p_candidates: [], p_error: message.slice(0, 500),
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
