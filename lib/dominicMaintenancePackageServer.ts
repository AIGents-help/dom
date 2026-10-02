import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deriveIssueTrend, issueTrendLabel } from "@/lib/dominicIssueTrend";
import {
  deriveMaintenanceReviewPriority,
  maintenanceReviewPriorityLabel,
} from "@/lib/dominicMaintenanceReview";
import {
  maintenanceEvidenceRole,
  maintenanceEvidenceSequenceId,
  selectMaintenancePackageMedia,
} from "@/lib/dominicMaintenancePackage";
import { deriveVerificationAssessment } from "@/lib/dominicIssueLifecycle";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function targetFromFinding(finding: {
  latitude: number | null;
  longitude: number | null;
  spatial_anchor: JsonRecord;
}) {
  const raw =
    finding.spatial_anchor.targetLocation &&
    typeof finding.spatial_anchor.targetLocation === "object"
      ? (finding.spatial_anchor.targetLocation as JsonRecord)
      : null;
  const latitude = Number(raw?.latitude ?? finding.latitude);
  const longitude = Number(raw?.longitude ?? finding.longitude);
  const distanceM = Number(raw?.distanceM);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    distanceM: Number.isFinite(distanceM) ? distanceM : null,
    source:
      raw && Number.isFinite(Number(raw.latitude)) && Number.isFinite(Number(raw.longitude))
        ? "laser_localized"
        : "finding_location",
  };
}

export async function loadDominicMaintenancePackage(userId: string, issueId: string) {
  const admin = getSupabaseAdmin();
  const { data: issue, error: issueError } = await admin
    .from("dominic_issues")
    .select(
      "id,asset_id,issue_type,title,description,severity,status,confidence,recommended_action,first_seen_at,last_seen_at,resolved_at,verified_at,resolution_notes,metadata,created_at,updated_at",
    )
    .eq("id", issueId)
    .eq("user_id", userId)
    .maybeSingle();

  if (issueError) throw issueError;
  if (!issue) return null;

  const [{ data: asset, error: assetError }, { data: linkRows, error: linkError }] =
    await Promise.all([
      admin
        .from("dominic_assets")
        .select(
          "id,name,asset_type,external_ref,description,status,condition_state,condition_score,condition_updated_at,location_label,latitude,longitude,altitude_ft,attributes,baseline_at,last_inspected_at,next_inspection_due_at",
        )
        .eq("id", issue.asset_id)
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("dominic_issue_findings")
        .select("finding_id,inspection_id,relation_type,linked_at")
        .eq("issue_id", issue.id)
        .eq("user_id", userId)
        .order("linked_at", { ascending: true }),
    ]);

  if (assetError) throw assetError;
  if (linkError) throw linkError;
  if (!asset) return null;

  const links = linkRows ?? [];
  const issueMetadata = record(issue.metadata);
  const verificationInspectionId =
    typeof issueMetadata.verificationInspectionId === "string"
      ? issueMetadata.verificationInspectionId
      : typeof issueMetadata.lastVerificationInspectionId === "string"
        ? issueMetadata.lastVerificationInspectionId
        : null;
  const findingIds = links.map((item) => item.finding_id);
  const inspectionIds = Array.from(
    new Set([
      ...links.map((item) => item.inspection_id),
      ...(verificationInspectionId ? [verificationInspectionId] : []),
    ]),
  );

  const [
    findingResult,
    inspectionResult,
    evidenceResult,
    mediaResult,
    eventResult,
    verificationFindingResult,
  ] = await Promise.all([
      findingIds.length
        ? admin
            .from("dominic_findings")
            .select(
              "id,inspection_id,finding_type,title,description,severity,review_status,confidence,sensor_mode,latitude,longitude,spatial_anchor,measurement,detector,observed_at,created_at",
            )
            .eq("user_id", userId)
            .in("id", findingIds)
            .order("observed_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      inspectionIds.length
        ? admin
            .from("dominic_inspections")
            .select(
              "id,inspection_type,objective,status,capture_source,sensor_modes,started_at,completed_at,summary,ai_summary,environmental_context,created_at",
            )
            .eq("user_id", userId)
            .in("id", inspectionIds)
        : Promise.resolve({ data: [], error: null }),
      findingIds.length
        ? admin
            .from("dominic_finding_evidence")
            .select(
              "id,finding_id,evidence_type,storage_path,source_table,source_id,mime_type,captured_at,metadata,created_at",
            )
            .eq("user_id", userId)
            .in("finding_id", findingIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      inspectionIds.length
        ? admin
            .from("dominic_inspection_media")
            .select(
              "id,inspection_id,asset_id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,latitude,longitude,relative_altitude_ft,source_capture_id,source_aircraft_id,analysis_status,analysis_summary,metadata,created_at",
            )
            .eq("user_id", userId)
            .in("inspection_id", inspectionIds)
            .order("captured_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("dominic_issue_events")
        .select("id,inspection_id,finding_id,event_type,summary,details,created_at")
        .eq("issue_id", issue.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      verificationInspectionId
        ? admin
            .from("dominic_findings")
            .select("id,title,severity,review_status,detector,observed_at")
            .eq("user_id", userId)
            .eq("asset_id", issue.asset_id)
            .eq("inspection_id", verificationInspectionId)
            .order("observed_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (findingResult.error) throw findingResult.error;
  if (inspectionResult.error) throw inspectionResult.error;
  if (evidenceResult.error) throw evidenceResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (eventResult.error) throw eventResult.error;
  if (verificationFindingResult.error) throw verificationFindingResult.error;

  const findings = (findingResult.data ?? []).map((finding) => ({
    ...finding,
    spatial_anchor: record(finding.spatial_anchor),
    measurement: record(finding.measurement),
    detector: record(finding.detector),
  }));
  const inspections = (inspectionResult.data ?? []).map((inspection) => ({
    ...inspection,
    ai_summary: record(inspection.ai_summary),
  }));
  const findingEvidence = (evidenceResult.data ?? []).map((item) => ({
    ...item,
    metadata: record(item.metadata),
  }));
  const inspectionMedia = (mediaResult.data ?? []).map((item) => ({
    ...item,
    metadata: record(item.metadata),
    analysis_summary: record(item.analysis_summary),
  }));
  const events = (eventResult.data ?? []).map((item) => ({
    ...item,
    details: record(item.details),
  }));
  const verificationFindings = (verificationFindingResult.data ?? []).map((finding) => ({
    ...finding,
    detector: record(finding.detector),
  }));

  const selectedMediaByFinding = new Map(
    findings.map((finding) => {
      const explicitEvidence = findingEvidence
        .filter((item) => item.finding_id === finding.id)
        .map((item) => ({
          source_id: item.source_id,
          storage_path: item.storage_path,
        }));
      return [
        finding.id,
        selectMaintenancePackageMedia(
          {
            inspection_id: finding.inspection_id,
            spatial_anchor: finding.spatial_anchor,
            detector: finding.detector,
          },
          inspectionMedia,
          explicitEvidence,
        ),
      ] as const;
    }),
  );

  const storagePaths = new Set<string>();
  for (const selected of selectedMediaByFinding.values()) {
    for (const item of selected) {
      if (item.storage_path && item.mime_type?.startsWith("image/")) {
        storagePaths.add(item.storage_path);
      }
    }
  }
  for (const item of findingEvidence) {
    if (item.storage_path && item.mime_type?.startsWith("image/")) {
      storagePaths.add(item.storage_path);
    }
  }
  if (verificationInspectionId) {
    for (const item of inspectionMedia) {
      if (
        item.inspection_id === verificationInspectionId &&
        item.storage_path &&
        item.mime_type?.startsWith("image/")
      ) {
        storagePaths.add(item.storage_path);
      }
    }
  }

  const signedEntries = await Promise.all(
    Array.from(storagePaths).map(async (storagePath) => {
      const { data } = await admin.storage
        .from("pilot-media")
        .createSignedUrl(storagePath, 3600);
      return [storagePath, data?.signedUrl ?? null] as const;
    }),
  );
  const signedUrls = new Map(
    signedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );

  const trend = deriveIssueTrend(
    findings.map((finding) => ({
      severity: finding.severity,
      confidence: finding.confidence,
      observedAt: finding.observed_at,
    })),
  );
  const maintenanceReview = deriveMaintenanceReviewPriority({
    severity: issue.severity,
    status: issue.status,
    firstSeenAt: issue.first_seen_at,
    lastSeenAt: issue.last_seen_at,
    metadata: record(issue.metadata),
  });

  const observations = findings.map((finding) => {
    const inspection =
      inspections.find((item) => item.id === finding.inspection_id) ?? null;
    const link =
      links.find((item) => item.finding_id === finding.id) ?? null;
    const selectedMedia = selectedMediaByFinding.get(finding.id) ?? [];
    const explicitEvidence = findingEvidence.filter(
      (item) => item.finding_id === finding.id,
    );
    const selectedMediaIds = new Set(selectedMedia.map((item) => item.id));
    const selectedStoragePaths = new Set(
      selectedMedia.map((item) => item.storage_path).filter(Boolean),
    );

    const evidence = [
      ...selectedMedia.map((item) => ({
        id: item.id,
        source: "inspection_media" as const,
        role: maintenanceEvidenceRole(item.metadata),
        sequenceId: maintenanceEvidenceSequenceId(item.metadata),
        storagePath: item.storage_path,
        signedUrl: item.storage_path ? signedUrls.get(item.storage_path) ?? null : null,
        originalFilename: item.original_filename,
        mimeType: item.mime_type,
        sensorMode: item.sensor_mode,
        capturedAt: item.captured_at,
        latitude: item.latitude,
        longitude: item.longitude,
        relativeAltitudeFt: item.relative_altitude_ft,
        sourceAircraftId: item.source_aircraft_id,
        analysisStatus: item.analysis_status,
      })),
      ...explicitEvidence
        .filter(
          (item) =>
            !selectedMediaIds.has(item.source_id ?? "") &&
            !selectedStoragePaths.has(item.storage_path),
        )
        .map((item) => ({
          id: item.id,
          source: "finding_evidence" as const,
          role: "evidence",
          sequenceId: null,
          storagePath: item.storage_path,
          signedUrl: item.storage_path ? signedUrls.get(item.storage_path) ?? null : null,
          originalFilename: null,
          mimeType: item.mime_type,
          sensorMode: item.evidence_type,
          capturedAt: item.captured_at,
          latitude: null,
          longitude: null,
          relativeAltitudeFt: null,
          sourceAircraftId: null,
          analysisStatus: null,
        })),
    ];

    const comparisonState =
      typeof finding.detector.comparisonState === "string"
        ? finding.detector.comparisonState
        : null;
    const comparisonNote =
      typeof finding.detector.comparisonNote === "string"
        ? finding.detector.comparisonNote
        : null;

    return {
      link,
      finding,
      inspection,
      target: targetFromFinding(finding),
      comparison: {
        state: comparisonState,
        note: comparisonNote,
      },
      evidence,
    };
  });

  const verificationInspection = verificationInspectionId
    ? inspections.find((item) => item.id === verificationInspectionId) ?? null
    : null;
  const verificationSummary = verificationInspection?.ai_summary ?? {};
  const verificationCandidateCount = Number(verificationSummary.candidateCount);
  const verificationConfirmed = verificationFindings.filter(
    (finding) => finding.review_status === "confirmed",
  );
  const verificationAssessment = verificationInspection
    ? deriveVerificationAssessment({
        inspectionStatus: verificationInspection.status,
        baselineCompared: verificationSummary.baselineCompared === true,
        candidateCount: Number.isFinite(verificationCandidateCount)
          ? verificationCandidateCount
          : null,
        pendingReviewCount: verificationFindings.filter(
          (finding) => finding.review_status === "needs_review",
        ).length,
        confirmedCount: verificationConfirmed.length,
        dismissedCount: verificationFindings.filter(
          (finding) => finding.review_status === "dismissed",
        ).length,
        comparisonStates: verificationConfirmed.map((finding) =>
          typeof finding.detector.comparisonState === "string"
            ? finding.detector.comparisonState
            : null,
        ),
      })
    : null;
  const verificationEvidence = verificationInspectionId
    ? inspectionMedia
        .filter(
          (item) =>
            item.inspection_id === verificationInspectionId &&
            item.media_type === "image",
        )
        .map((item) => ({
          id: item.id,
          source: "inspection_media" as const,
          role: maintenanceEvidenceRole(item.metadata),
          sequenceId: maintenanceEvidenceSequenceId(item.metadata),
          storagePath: item.storage_path,
          signedUrl: item.storage_path ? signedUrls.get(item.storage_path) ?? null : null,
          originalFilename: item.original_filename,
          mimeType: item.mime_type,
          sensorMode: item.sensor_mode,
          capturedAt: item.captured_at,
          latitude: item.latitude,
          longitude: item.longitude,
          relativeAltitudeFt: item.relative_altitude_ft,
          sourceAircraftId: item.source_aircraft_id,
          analysisStatus: item.analysis_status,
        }))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    asset,
    issue: {
      ...issue,
      metadata: record(issue.metadata),
    },
    maintenanceReview: {
      ...maintenanceReview,
      label: maintenanceReviewPriorityLabel(maintenanceReview.priority),
    },
    trend: {
      ...trend,
      label: issueTrendLabel(trend.trend),
    },
    observations,
    verification: verificationInspection && verificationAssessment
      ? {
          inspection: verificationInspection,
          assessment: verificationAssessment,
          findings: verificationFindings,
          evidence: verificationEvidence,
        }
      : null,
    events,
  };
}
