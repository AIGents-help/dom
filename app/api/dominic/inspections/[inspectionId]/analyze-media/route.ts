import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildFollowUpCapturePrescription } from "@/lib/dominicFollowUpCapture";
import {
  rangefinderTargetMatchesRegion,
  readStoredRangefinderTarget,
} from "@/lib/aircraft/rangefinderTarget";
import { resolveDominicInspectionProfile } from "@/lib/dominicInspectionProfiles";
import {
  buildDominicVisionPrompt,
  DOMINIC_VISION_SCHEMA,
  extractResponsesApiText,
  parseDominicVisionScreening,
} from "@/lib/dominicVision";

export const runtime = "nodejs";

function fingerprint(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
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
  if (!String(media.storage_path).startsWith(`${user.id}/`)) {
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
    .from("pilot-media")
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
        .select("id,storage_path,mime_type")
        .eq("user_id", user.id)
        .eq("finding_id", issue.current_finding_id)
        .not("storage_path", "is", null)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (evidence?.storage_path && evidence.mime_type?.startsWith("image/")) {
        const { data: baselineSigned } = await admin.storage
          .from("pilot-media")
          .createSignedUrl(evidence.storage_path, 300);
        if (baselineSigned?.signedUrl) {
          baselineSignedUrl = baselineSigned.signedUrl;
          baselineEvidenceId = evidence.id;
        }
      }
    }
  }

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
  });

  await Promise.all([
    admin
      .from("dominic_inspection_media")
      .update({ analysis_status: "analyzing" })
      .eq("id", media.id)
      .eq("user_id", user.id),
    inspection.status === "planned" || inspection.status === "capturing"
      ? admin
          .from("dominic_inspections")
          .update({ status: "analyzing" })
          .eq("id", inspection.id)
          .eq("user_id", user.id)
      : Promise.resolve({ error: null }),
  ]);

  try {
    const response = await fetch(providerUrl, {
      method: "POST",
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
      const followUpCapture = buildFollowUpCapturePrescription({
        region: candidate.region,
        confidence: candidate.confidence,
        comparisonState: candidate.comparison_state,
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
          comparisonState: candidate.comparison_state,
          comparisonNote: candidate.comparison_note,
          baselineFindingId,
          baselineEvidenceId,
          screeningSummary: screening.summary,
          limitations: screening.limitations,
          followUpCapture,
        },
        observed_at: media.captured_at ?? new Date().toISOString(),
      };
    });

    const fingerprints = candidateRows.map((row) => row.fingerprint);
    let existingFingerprints = new Set<string>();
    if (fingerprints.length) {
      const { data: existing } = await admin
        .from("dominic_findings")
        .select("fingerprint")
        .eq("user_id", user.id)
        .eq("inspection_id", inspection.id)
        .in("fingerprint", fingerprints);
      existingFingerprints = new Set(
        (existing ?? [])
          .map((row) => row.fingerprint)
          .filter((value): value is string => typeof value === "string"),
      );
    }

    const newRows = candidateRows.filter((row) => !existingFingerprints.has(row.fingerprint));
    if (newRows.length) {
      const { error: insertError } = await admin.from("dominic_findings").insert(newRows);
      if (insertError) throw insertError;
    }

    await Promise.all([
      admin
        .from("dominic_inspection_media")
        .update({
          analysis_status: "review",
          analysis_summary: {
            provider,
            model,
            inspectionProfileId: inspectionProfile.id,
            inspectionProfileLabel: inspectionProfile.label,
            summary: screening.summary,
            candidateCount: screening.candidates.length,
            limitations: screening.limitations,
            baselineCompared: Boolean(baselineSignedUrl),
            baselineFindingId,
            baselineEvidenceId,
            analyzedAt: new Date().toISOString(),
          },
        })
        .eq("id", media.id)
        .eq("user_id", user.id),
      admin
        .from("dominic_inspections")
        .update({
          status: "review",
          ai_summary: {
            latestMediaId: media.id,
            provider,
            model,
            inspectionProfileId: inspectionProfile.id,
            inspectionProfileLabel: inspectionProfile.label,
            summary: screening.summary,
            candidateCount: screening.candidates.length,
            limitations: screening.limitations,
            baselineCompared: Boolean(baselineSignedUrl),
            baselineFindingId,
            baselineEvidenceId,
            analyzedAt: new Date().toISOString(),
          },
        })
        .eq("id", inspection.id)
        .eq("user_id", user.id),
    ]);

    const { data: findings } = await admin
      .from("dominic_findings")
      .select("id,finding_type,title,description,severity,review_status,confidence,sensor_mode,fingerprint,spatial_anchor,detector,observed_at")
      .eq("user_id", user.id)
      .eq("inspection_id", inspection.id)
      .eq("review_status", "needs_review")
      .order("observed_at", { ascending: false });

    return NextResponse.json({
      configured: true,
      mediaId: media.id,
      summary: screening.summary,
      limitations: screening.limitations,
      candidateCount: screening.candidates.length,
      baselineCompared: Boolean(baselineSignedUrl),
      baselineFindingId,
      findings: findings ?? [],
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision screening failed.";
    await admin
      .from("dominic_inspection_media")
      .update({
        analysis_status: "failed",
        analysis_summary: {
          provider,
          model,
          failedAt: new Date().toISOString(),
          error: message.slice(0, 500),
        },
      })
      .eq("id", media.id)
      .eq("user_id", user.id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
