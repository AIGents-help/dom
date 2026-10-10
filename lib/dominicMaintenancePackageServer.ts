import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isOwnedInspectionStoragePath } from "@/lib/dominicInspectionEvidence";
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
import { loadDominicIssueVerification } from "@/lib/dominicIssueVerificationServer";
import { readAllReportRows, REPORT_PAGE_SIZE } from "@/lib/dominicInspectionReport";

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

export async function loadDominicMaintenancePackage(userId: string, issueId: string, signal: AbortSignal) {
  const admin = getSupabaseAdmin();
  const verificationSnapshot = await loadDominicIssueVerification(admin, userId, issueId, signal);
  if (!verificationSnapshot) return null;
  const { data: issue, error: issueError } = await admin
    .from("dominic_issues")
    .select(
      "id,asset_id,issue_type,title,description,severity,status,confidence,recommended_action,first_seen_at,last_seen_at,resolved_at,verified_at,resolution_notes,metadata,created_at,updated_at",
    )
    .eq("id", issueId)
    .eq("user_id", userId)
    .abortSignal(signal)
    .maybeSingle();

  if (issueError) throw issueError;
  if (!issue) return null;
  if (issue.updated_at !== verificationSnapshot.issue.updated_at) {
    throw new Error("The issue changed while assembling its maintenance package. Retry.");
  }

  const [{ data: asset, error: assetError }, { data: linkRows, error: linkError }] =
    await Promise.all([
      admin
        .from("dominic_assets")
        .select(
          "id,name,asset_type,external_ref,description,status,condition_state,condition_score,condition_updated_at,location_label,latitude,longitude,altitude_ft,attributes,baseline_at,last_inspected_at,next_inspection_due_at",
        )
        .eq("id", issue.asset_id)
        .eq("user_id", userId)
        .abortSignal(signal).maybeSingle(),
      admin
        .from("dominic_issue_findings")
        .select("finding_id,inspection_id,relation_type,linked_at")
        .eq("issue_id", issue.id)
        .eq("user_id", userId)
        .order("linked_at", { ascending: true }).abortSignal(signal),
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
  const verificationInspectionResult = verificationInspectionId
    ? await admin.from("dominic_inspections")
        .select("id,inspection_type,objective,status,capture_source,sensor_modes,started_at,completed_at,summary,ai_summary,environmental_context,created_at,verification_revision")
        .eq("id", verificationInspectionId).eq("user_id", userId).eq("asset_id", issue.asset_id)
        .abortSignal(signal).maybeSingle()
    : { data: null, error: null };
  if (verificationInspectionResult.error) throw verificationInspectionResult.error;
  const findingIds = links.map((item) => item.finding_id);
  const inspectionIds = Array.from(
    new Set([
      ...links.map((item) => item.inspection_id),
    ]),
  );

  const [
    findingResult,
    inspectionResult,
    evidenceResult,
    mediaResult,
    eventResult,
    verificationMedia,
  ] = await Promise.all([
      findingIds.length
        ? admin
            .from("dominic_findings")
            .select(
              "id,inspection_id,finding_type,title,description,severity,review_status,confidence,sensor_mode,latitude,longitude,spatial_anchor,measurement,detector,observed_at,created_at",
            )
            .eq("user_id", userId)
            .eq("asset_id", issue.asset_id)
            .in("id", findingIds)
            .order("observed_at", { ascending: true }).abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
      inspectionIds.length
        ? admin
            .from("dominic_inspections")
            .select(
              "id,inspection_type,objective,status,capture_source,sensor_modes,started_at,completed_at,summary,ai_summary,environmental_context,created_at",
            )
            .eq("user_id", userId)
            .eq("asset_id", issue.asset_id)
            .in("id", inspectionIds).abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
      findingIds.length
        ? admin
            .from("dominic_finding_evidence")
            .select(
              "id,finding_id,evidence_type,storage_path,source_table,source_id,mime_type,captured_at,metadata,created_at",
            )
            .eq("user_id", userId)
            .in("finding_id", findingIds)
            .order("created_at", { ascending: true }).abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
      inspectionIds.length
        ? admin
            .from("dominic_inspection_media")
            .select(
              "id,inspection_id,asset_id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,latitude,longitude,relative_altitude_ft,source_capture_id,source_aircraft_id,analysis_status,analysis_summary,metadata,created_at",
            )
            .eq("user_id", userId)
            .eq("asset_id", issue.asset_id)
            .in("inspection_id", inspectionIds)
            .order("captured_at", { ascending: true }).abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("dominic_issue_events")
        .select("id,inspection_id,finding_id,event_type,summary,details,created_at")
        .eq("issue_id", issue.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }).abortSignal(signal),
      verificationInspectionResult.data
        ? readAllReportRows((after) => {
            let query = admin.from("dominic_inspection_media")
              .select("id,inspection_id,asset_id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,latitude,longitude,relative_altitude_ft,source_capture_id,source_aircraft_id,analysis_status,analysis_summary,metadata,created_at")
              .eq("user_id", userId).eq("asset_id", issue.asset_id)
              .eq("inspection_id", verificationInspectionId)
              .order("id").limit(REPORT_PAGE_SIZE);
            if (after) query = query.gt("id", after);
            return query.abortSignal(signal);
          }, signal)
        : Promise.resolve([]),
    ]);

  if (findingResult.error) throw findingResult.error;
  if (inspectionResult.error) throw inspectionResult.error;
  if (evidenceResult.error) throw evidenceResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (eventResult.error) throw eventResult.error;

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
  const verificationFindings = verificationSnapshot.verificationFindings;
  const verificationMediaRows = verificationMedia.map((item) => ({
    ...item, metadata: record(item.metadata), analysis_summary: record(item.analysis_summary),
  })).sort((a, b) => String(a.captured_at).localeCompare(String(b.captured_at)) || a.id.localeCompare(b.id));

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
    for (const item of verificationMediaRows) {
      if (
        item.inspection_id === verificationInspectionId &&
        item.storage_path &&
        item.mime_type?.startsWith("image/")
      ) {
        storagePaths.add(item.storage_path);
      }
    }
  }

  const signedEntries: Array<readonly [string, string | null]> = [];
  const ownedPaths = Array.from(storagePaths).filter((path) => isOwnedInspectionStoragePath(path, userId));
  for (let start = 0; start < ownedPaths.length; start += 8) {
    if (signal.aborted) throw new Error("Maintenance package request cancelled.");
    signedEntries.push(...await Promise.all(ownedPaths.slice(start, start + 8).map(async (storagePath) => {
      const { data } = await admin.storage.from("dominic-inspection-evidence").createSignedUrl(storagePath, 3600);
      return [storagePath, data?.signedUrl ?? null] as const;
    })));
  }
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

  const verificationInspection = verificationInspectionResult.data
    ? { ...verificationInspectionResult.data, ai_summary: record(verificationInspectionResult.data.ai_summary) }
    : null;
  const currentVerification = verificationSnapshot.verificationInspection;
  const isCurrentVerification = Boolean(currentVerification && currentVerification.id === verificationInspectionId);
  const verificationAssessment = isCurrentVerification
    ? verificationSnapshot.assessment
    : verificationInspection ? {
        status: "previous_verification", canVerify: false, shouldReopen: false,
        reasons: ["Evidence from the previous verification inspection. Its recorded outcome is in the issue history; a new inspection is required to verify this issue."],
      } : null;
  if (isCurrentVerification && verificationInspection) {
    Object.assign(verificationInspection, currentVerification);
  }
  const verificationEvidence = verificationInspectionId
    ? verificationMediaRows
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

  // Reject a mixed report if issue linkage or source evidence changed while its
  // images were paged/signed. This is a report-time check, not a closure action.
  const finalSnapshot = await loadDominicIssueVerification(admin, userId, issueId, signal);
  if (signal.aborted || !finalSnapshot ||
      finalSnapshot.issue.updated_at !== verificationSnapshot.issue.updated_at ||
      finalSnapshot.verificationInspection?.id !== currentVerification?.id ||
      finalSnapshot.verificationInspection?.verification_revision !== currentVerification?.verification_revision) {
    throw new Error("Verification evidence changed while assembling the report. Retry.");
  }

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
          findings: isCurrentVerification ? verificationFindings : [],
          counts: isCurrentVerification ? verificationSnapshot.verificationCounts : null,
          evidence: verificationEvidence,
        }
      : null,
    events,
  };
}
