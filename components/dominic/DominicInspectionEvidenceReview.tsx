"use client";

/* eslint-disable @next/next/no-img-element -- signed private inspection evidence is rendered directly */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileImage,
  PlusCircle,
  ScanSearch,
  Upload,
  XCircle,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { readStoredRangefinderTarget } from "@/lib/aircraft/rangefinderTarget";

const ORANGE = "#F45A1E";
const PANEL = "#10171E";
const PANEL_2 = "#151E27";
const LINE = "#26323D";
const TEXT = "#F4F7FA";
const MUTED = "#8F9CAA";
const GREEN = "#70D6A0";
const AMBER = "#FFB565";
const RED = "#FF7474";

type InspectionContext = {
  id: string;
  asset_id: string;
  inspection_type: string;
  objective: string | null;
  status: string;
  sensor_modes: string[];
};

type AssetContext = {
  id: string;
  name: string;
  asset_type: string;
};

type MediaRow = {
  id: string;
  sensor_mode: string;
  media_type: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  captured_at: string | null;
  analysis_status: "pending" | "analyzing" | "review" | "complete" | "failed";
  analysis_summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

type FindingRow = {
  id: string;
  finding_type: string;
  title: string;
  description: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode: string | null;
  spatial_anchor: Record<string, unknown>;
  detector: Record<string, unknown>;
  observed_at: string;
};

type ManualFindingForm = {
  mediaId: string;
  findingType: string;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  description: string;
  recommendedAction: string;
};

const EMPTY_MANUAL: ManualFindingForm = {
  mediaId: "",
  findingType: "visual_anomaly",
  severity: "medium",
  title: "",
  description: "",
  recommendedAction: "",
};

function severityColor(severity: FindingRow["severity"]) {
  if (severity === "critical" || severity === "high") return RED;
  if (severity === "medium") return AMBER;
  if (severity === "low") return "#8FC7FF";
  return MUTED;
}

function cleanFilename(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 120) || "inspection-image.jpg";
}

function mediaIdFromFinding(finding: FindingRow) {
  const detectorMediaId = finding.detector?.mediaId;
  if (typeof detectorMediaId === "string") return detectorMediaId;
  const anchorMediaId = finding.spatial_anchor?.mediaId;
  return typeof anchorMediaId === "string" ? anchorMediaId : null;
}

function comparisonFromFinding(finding: FindingRow) {
  const state =
    typeof finding.detector?.comparisonState === "string"
      ? finding.detector.comparisonState
      : null;
  const note =
    typeof finding.detector?.comparisonNote === "string"
      ? finding.detector.comparisonNote
      : null;
  const rawRepeatability =
    finding.detector?.captureRepeatability &&
    typeof finding.detector.captureRepeatability === "object"
      ? (finding.detector.captureRepeatability as Record<string, unknown>)
      : null;
  const repeatabilityScore = Number(rawRepeatability?.score);
  const repeatabilityComparable = rawRepeatability?.comparable === true;
  const repeatabilityWarnings = Array.isArray(rawRepeatability?.warnings)
    ? rawRepeatability.warnings.filter((item): item is string => typeof item === "string")
    : [];
  return {
    state,
    note,
    repeatability:
      Number.isFinite(repeatabilityScore)
        ? {
            score: repeatabilityScore,
            comparable: repeatabilityComparable,
            warnings: repeatabilityWarnings,
          }
        : null,
  };
}

function followUpFromFinding(finding: FindingRow) {
  const raw = finding.detector?.followUpCapture;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const needed = record.needed === true;
  const zoom = Number(record.estimatedOpticalZoomMultiplier);
  const reasons = Array.isArray(record.reason)
    ? record.reason.filter((item): item is string => typeof item === "string")
    : [];
  const guidance = Array.isArray(record.guidance)
    ? record.guidance.filter((item): item is string => typeof item === "string")
    : [];
  const target = record.targetLocation && typeof record.targetLocation === "object"
    ? (record.targetLocation as Record<string, unknown>)
    : null;
  const latitude = Number(target?.latitude);
  const longitude = Number(target?.longitude);
  const distanceM = Number(target?.distanceM);
  const center = record.center && typeof record.center === "object"
    ? (record.center as Record<string, unknown>)
    : null;
  const centerX = Number(center?.x);
  const centerY = Number(center?.y);
  return {
    needed,
    zoom: Number.isFinite(zoom) ? zoom : 1,
    reasons,
    guidance,
    focusTarget:
      Number.isFinite(centerX) && Number.isFinite(centerY)
        ? { x: centerX, y: centerY }
        : null,
    target:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? {
            latitude,
            longitude,
            distanceM: Number.isFinite(distanceM) ? distanceM : null,
          }
        : null,
  };
}

function imageRegionFromFinding(finding: FindingRow) {
  const region = finding.spatial_anchor?.imageRegion;
  if (!region || typeof region !== "object") return null;
  const record = region as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export default function DominicInspectionEvidenceReview({
  inspection,
  asset,
  onChanged,
  onPlanFollowUp,
}: {
  inspection: InspectionContext;
  asset: AssetContext;
  onChanged?: () => void | Promise<void>;
  onPlanFollowUp?: (input: {
    findingId: string;
    findingTitle: string;
    target: { latitude: number; longitude: number; distanceM?: number } | null;
    estimatedOpticalZoomMultiplier: number;
    focusTarget: { x: number; y: number } | null;
    reasons: string[];
    guidance: string[];
  }) => void;
}) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [sensorMode, setSensorMode] = useState("rgb");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [analysisBusyId, setAnalysisBusyId] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [manual, setManual] = useState<ManualFindingForm>(EMPTY_MANUAL);
  const [message, setMessage] = useState<string | null>(null);
  const [aiReadiness, setAiReadiness] = useState<{
    loading: boolean;
    configured: boolean;
    provider: string | null;
    model: string | null;
  }>({ loading: true, configured: false, provider: null, model: null });

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [mediaResult, findingResult] = await Promise.all([
      sb
        .from("dominic_inspection_media")
        .select("id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,analysis_status,analysis_summary,metadata,created_at")
        .eq("inspection_id", inspection.id)
        .eq("asset_id", asset.id)
        .order("created_at", { ascending: false }),
      sb
        .from("dominic_findings")
        .select("id,finding_type,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at")
        .eq("inspection_id", inspection.id)
        .eq("asset_id", asset.id)
        .order("observed_at", { ascending: false }),
    ]);

    if (mediaResult.error) throw mediaResult.error;
    if (findingResult.error) throw findingResult.error;

    const nextMedia = (mediaResult.data ?? []) as MediaRow[];
    setMedia(nextMedia);
    setFindings((findingResult.data ?? []) as FindingRow[]);

    const urlEntries = await Promise.all(
      nextMedia
        .filter((item) => item.storage_path)
        .map(async (item) => {
          const { data } = await sb.storage
            .from("pilot-media")
            .createSignedUrl(item.storage_path as string, 900);
          return [item.id, data?.signedUrl ?? ""] as const;
        }),
    );
    setSignedUrls(Object.fromEntries(urlEntries.filter(([, url]) => Boolean(url))));
    setManual((current) => ({
      ...current,
      mediaId:
        current.mediaId && nextMedia.some((item) => item.id === current.mediaId)
          ? current.mediaId
          : nextMedia[0]?.id ?? "",
    }));
  }, [inspection.id, asset.id]);

  useEffect(() => {
    setMessage(null);
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Inspection evidence could not be loaded.");
    });
  }, [load]);


  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = getSupabaseBrowser();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("No active session.");
        const response = await fetch("/api/dominic/ai/status", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? "AI status unavailable.");
        if (!active) return;
        setAiReadiness({
          loading: false,
          configured: Boolean(body?.configured),
          provider: typeof body?.provider === "string" ? body.provider : null,
          model: typeof body?.model === "string" ? body.model : null,
        });
      } catch {
        if (!active) return;
        setAiReadiness({ loading: false, configured: false, provider: null, model: null });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const reviewableCount = useMemo(
    () => findings.filter((finding) => finding.review_status === "needs_review").length,
    [findings],
  );

  const uploadEvidence = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("Select an image file from the inspection.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessage("Inspection image is larger than the current 30 MB upload limit.");
      return;
    }

    setUploadBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Your DOMINIC session expired.");

      const storagePath = `${userId}/dominic-inspections/${inspection.id}/${Date.now()}-${crypto.randomUUID()}-${cleanFilename(file.name)}`;
      const { error: uploadError } = await sb.storage
        .from("pilot-media")
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const capturedAt =
        Number.isFinite(file.lastModified) && file.lastModified > 0
          ? new Date(file.lastModified).toISOString()
          : new Date().toISOString();

      const { error: rowError } = await sb
        .from("dominic_inspection_media")
        .insert({
          user_id: userId,
          inspection_id: inspection.id,
          asset_id: asset.id,
          sensor_mode: sensorMode,
          media_type: "image",
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type || "image/jpeg",
          captured_at: capturedAt,
          analysis_status: "pending",
          metadata: {
            source: "operator_upload",
            assetName: asset.name,
            inspectionType: inspection.inspection_type,
          },
        });
      if (rowError) {
        await sb.storage.from("pilot-media").remove([storagePath]);
        throw rowError;
      }

      await sb
        .from("dominic_inspections")
        .update({
          status: inspection.status === "planned" ? "review" : inspection.status,
        })
        .eq("id", inspection.id);

      await load();
      await onChanged?.();
      setMessage("Evidence attached to this inspection.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence upload failed.");
    } finally {
      setUploadBusy(false);
    }
  };

  const runScreening = async (mediaId: string) => {
    setAnalysisBusyId(mediaId);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your DOMINIC session expired.");

      const response = await fetch(
        `/api/dominic/inspections/${inspection.id}/analyze-media`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mediaId }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body?.code === "VISION_NOT_CONFIGURED") {
          throw new Error(
            "AI screening is not configured on this deployment yet. You can still add and confirm an operator finding below.",
          );
        }
        throw new Error(body?.error ?? "AI screening failed.");
      }

      await load();
      await onChanged?.();
      const count = Number(body?.candidateCount ?? 0);
      const baselineCompared = Boolean(body?.baselineCompared);
      setMessage(
        count
          ? baselineCompared
            ? `DOMINIC compared this evidence with the prior confirmed issue evidence and flagged ${count} candidate finding${count === 1 ? "" : "s"} for human review.`
            : `DOMINIC flagged ${count} candidate finding${count === 1 ? "" : "s"} for human review.`
          : baselineCompared
            ? "DOMINIC compared this evidence with the prior confirmed issue evidence and did not flag a visible anomaly. Human review is still required."
            : "DOMINIC did not flag a visible anomaly in this image. Human review is still required for inspection completion.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI screening failed.");
    } finally {
      setAnalysisBusyId(null);
    }
  };

  const reviewFinding = async (
    findingId: string,
    action: "confirm" | "dismiss",
  ) => {
    setReviewBusyId(findingId);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your DOMINIC session expired.");

      const response = await fetch(`/api/dominic/findings/${findingId}/review`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Finding review failed.");

      await load();
      await onChanged?.();
      setMessage(
        action === "confirm"
          ? body?.reusedIssue
            ? "Finding confirmed as another observation of an existing DOMINIC issue. Issue history updated."
            : "Finding confirmed and converted into a new tracked DOMINIC issue."
          : "Candidate finding dismissed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finding review failed.");
    } finally {
      setReviewBusyId(null);
    }
  };

  const createOperatorFinding = async () => {
    if (!manual.title.trim() || !manual.description.trim()) {
      setMessage("Give the finding a title and describe the visible evidence.");
      return;
    }

    setManualBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      const token = sessionData.session?.access_token;
      if (!userId || !token) throw new Error("Your DOMINIC session expired.");

      const selectedMedia = media.find((item) => item.id === manual.mediaId) ?? null;
      const { data: finding, error } = await sb
        .from("dominic_findings")
        .insert({
          user_id: userId,
          inspection_id: inspection.id,
          asset_id: asset.id,
          finding_type:
            manual.findingType.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") ||
            "visual_anomaly",
          title: manual.title.trim().slice(0, 160),
          description: manual.description.trim().slice(0, 1200),
          severity: manual.severity,
          review_status: "needs_review",
          confidence: null,
          sensor_mode: selectedMedia?.sensor_mode ?? "rgb",
          fingerprint: `operator:${inspection.id}:${crypto.randomUUID()}`,
          spatial_anchor: selectedMedia ? { mediaId: selectedMedia.id } : {},
          detector: {
            provider: "operator",
            mediaId: selectedMedia?.id ?? null,
            candidate: false,
            recommendedAction: manual.recommendedAction.trim().slice(0, 500),
          },
          observed_at: selectedMedia?.captured_at ?? new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !finding) throw error ?? new Error("Finding could not be created.");

      const response = await fetch(`/api/dominic/findings/${finding.id}/review`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "confirm" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Finding could not be confirmed.");

      setManual({
        ...EMPTY_MANUAL,
        mediaId: media[0]?.id ?? "",
      });
      await load();
      await onChanged?.();
      setMessage(
        body?.reusedIssue
          ? "Operator finding linked to an existing issue and recorded as progression."
          : "Operator finding recorded as a new tracked issue.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operator finding could not be saved.");
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        background: PANEL,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "11px 12px",
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: ORANGE,
              fontSize: 8,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: ".09em",
            }}
          >
            Inspection Evidence
          </div>
          <div style={{ color: TEXT, fontSize: 13, fontWeight: 900, marginTop: 3 }}>
            {asset.name} · {inspection.inspection_type.replaceAll("_", " ")}
          </div>
          <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
            {inspection.objective ?? "Review captured evidence and document visible issues."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
            title={aiReadiness.configured ? `AI screening via ${aiReadiness.model ?? aiReadiness.provider ?? "configured model"}` : "AI screening is not configured on this deployment"}
            style={{
              border: `1px solid ${aiReadiness.configured ? "rgba(112,214,160,.35)" : "rgba(255,181,101,.35)"}`,
              background: aiReadiness.configured ? "rgba(112,214,160,.08)" : "rgba(255,181,101,.08)",
              color: aiReadiness.loading ? MUTED : aiReadiness.configured ? GREEN : AMBER,
              borderRadius: 999,
              padding: "5px 8px",
              fontSize: 8,
              fontWeight: 900,
            }}
          >
            {aiReadiness.loading ? "AI CHECKING…" : aiReadiness.configured ? "AI SCREENING READY" : "AI NOT CONFIGURED"}
          </div>
          <div
            style={{
              border: `1px solid ${reviewableCount ? "rgba(255,181,101,.35)" : LINE}`,
              background: reviewableCount ? "rgba(255,181,101,.08)" : PANEL_2,
              color: reviewableCount ? AMBER : MUTED,
              borderRadius: 999,
              padding: "5px 8px",
              fontSize: 8,
              fontWeight: 900,
            }}
          >
            {reviewableCount} NEED REVIEW
          </div>
        </div>
      </div>

      {message ? (
        <div
          style={{
            margin: 10,
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            background: PANEL_2,
            color: MUTED,
            padding: "8px 10px",
            fontSize: 9,
            lineHeight: 1.45,
          }}
        >
          {message}
        </div>
      ) : null}

      <div style={{ padding: 11, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 7 }}>
          <select
            aria-label="Evidence sensor"
            value={sensorMode}
            onChange={(event) => setSensorMode(event.target.value)}
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL_2,
              color: TEXT,
              borderRadius: 8,
              padding: 8,
            }}
          >
            <option value="rgb">RGB wide</option>
            <option value="zoom">Zoom / telephoto</option>
            <option value="thermal">Thermal</option>
            <option value="multispectral">Multispectral</option>
            <option value="lidar">LiDAR-derived image</option>
          </select>
          <label
            style={{
              border: `1px dashed rgba(244,90,30,.45)`,
              background: "rgba(244,90,30,.07)",
              color: uploadBusy ? MUTED : "#FFD3C0",
              borderRadius: 8,
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 9,
              fontWeight: 900,
              cursor: uploadBusy ? "wait" : "pointer",
            }}
          >
            <Upload size={14} />
            {uploadBusy ? "Uploading evidence…" : "Add inspection image"}
            <input
              type="file"
              accept="image/*"
              disabled={uploadBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadEvidence(file);
              }}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>

      <div style={{ padding: 11, display: "grid", gap: 10 }}>
        {media.length === 0 ? (
          <div
            style={{
              border: `1px solid ${LINE}`,
              borderRadius: 9,
              background: PANEL_2,
              padding: 18,
              textAlign: "center",
              color: MUTED,
              fontSize: 9,
            }}
          >
            <FileImage size={22} color={ORANGE} />
            <div style={{ marginTop: 7 }}>
              No evidence attached yet. Add a Matrice 4E wide or zoom image from this inspection.
            </div>
          </div>
        ) : (
          media.map((item) => {
            const itemFindings = findings.filter(
              (finding) => mediaIdFromFinding(finding) === item.id,
            );
            const rangefinderTarget = readStoredRangefinderTarget(item.metadata);
            return (
              <div
                key={item.id}
                style={{
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  background: PANEL_2,
                  overflow: "hidden",
                }}
              >
                {signedUrls[item.id] ? (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      maxHeight: 360,
                      overflow: "hidden",
                      background: "#06090D",
                    }}
                  >
                    <img
                      src={signedUrls[item.id]}
                      alt={item.original_filename ?? "Inspection evidence"}
                      style={{
                        display: "block",
                        width: "100%",
                        maxHeight: 360,
                        objectFit: "contain",
                      }}
                    />
                    {rangefinderTarget?.screenX !== undefined &&
                    rangefinderTarget?.screenY !== undefined ? (
                      <div
                        title="Aircraft laser rangefinder target"
                        style={{
                          position: "absolute",
                          left: `${rangefinderTarget.screenX}%`,
                          top: `${rangefinderTarget.screenY}%`,
                          width: 18,
                          height: 18,
                          transform: "translate(-50%,-50%)",
                          border: "2px solid #70D6A0",
                          borderRadius: "50%",
                          boxShadow: "0 0 0 2px rgba(0,0,0,.55)",
                          pointerEvents: "none",
                        }}
                      >
                        <div style={{ position: "absolute", left: 7, top: -5, width: 2, height: 24, background: "#70D6A0" }} />
                        <div style={{ position: "absolute", left: -5, top: 7, width: 24, height: 2, background: "#70D6A0" }} />
                      </div>
                    ) : null}
                    {itemFindings
                      .filter((finding) => finding.review_status !== "dismissed")
                      .map((finding) => {
                        const region = imageRegionFromFinding(finding);
                        if (!region) return null;
                        return (
                          <div
                            key={finding.id}
                            title={finding.title}
                            style={{
                              position: "absolute",
                              left: `${region.x * 100}%`,
                              top: `${region.y * 100}%`,
                              width: `${region.width * 100}%`,
                              height: `${region.height * 100}%`,
                              border: `2px solid ${severityColor(finding.severity)}`,
                              background: "rgba(255,255,255,.03)",
                              boxSizing: "border-box",
                              pointerEvents: "none",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                left: -2,
                                top: -18,
                                background: severityColor(finding.severity),
                                color: "#081017",
                                padding: "2px 4px",
                                fontSize: 7,
                                fontWeight: 900,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {finding.title}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                ) : null}

                <div style={{ padding: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ color: TEXT, fontSize: 10, fontWeight: 900 }}>
                        {item.original_filename ?? "Inspection image"}
                      </div>
                      <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
                        {item.sensor_mode.toUpperCase()} · {item.analysis_status.replaceAll("_", " ")}
                      </div>
                      {rangefinderTarget ? (
                        <div style={{ color: GREEN, fontSize: 8, marginTop: 4, lineHeight: 1.4 }}>
                          Laser target · {rangefinderTarget.latitude.toFixed(6)}, {rangefinderTarget.longitude.toFixed(6)}
                          {rangefinderTarget.distanceM !== undefined
                            ? ` · ${rangefinderTarget.distanceM.toFixed(1)} m`
                            : ""}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void runScreening(item.id)}
                      disabled={analysisBusyId === item.id || !aiReadiness.configured}
                      style={{
                        border: `1px solid rgba(244,90,30,.4)`,
                        background: "rgba(244,90,30,.10)",
                        color: "#FFD3C0",
                        borderRadius: 7,
                        padding: "6px 8px",
                        display: "inline-flex",
                        gap: 5,
                        alignItems: "center",
                        fontSize: 8,
                        fontWeight: 900,
                        cursor: analysisBusyId === item.id ? "wait" : aiReadiness.configured ? "pointer" : "not-allowed",
                        opacity: aiReadiness.configured ? 1 : .55,
                      }}
                    >
                      <ScanSearch size={12} />
                      {analysisBusyId === item.id ? "Screening…" : aiReadiness.configured ? "Run AI Screening" : "AI Not Configured"}
                    </button>
                  </div>

                  {itemFindings.length ? (
                    <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                      {itemFindings.map((finding) => {
                        const comparison = comparisonFromFinding(finding);
                        const followUp = followUpFromFinding(finding);
                        return (
                        <div
                          key={finding.id}
                          style={{
                            border: `1px solid ${LINE}`,
                            background: PANEL,
                            borderRadius: 8,
                            padding: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              alignItems: "start",
                            }}
                          >
                            <div>
                              <div style={{ color: TEXT, fontSize: 9, fontWeight: 900 }}>
                                {finding.title}
                              </div>
                              <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.4, marginTop: 3 }}>
                                {finding.description}
                              </div>
                            </div>
                            <span
                              style={{
                                color: severityColor(finding.severity),
                                fontSize: 7,
                                fontWeight: 900,
                                textTransform: "uppercase",
                              }}
                            >
                              {finding.severity}
                            </span>
                          </div>
                          <div style={{ color: MUTED, fontSize: 7, marginTop: 5 }}>
                            {finding.confidence !== null
                              ? `${Math.round(finding.confidence * 100)}% model confidence · `
                              : ""}
                            {finding.review_status.replaceAll("_", " ")}
                          </div>
                          {comparison.state ? (
                            <div
                              style={{
                                marginTop: 6,
                                border: `1px solid ${LINE}`,
                                borderRadius: 7,
                                background: PANEL_2,
                                padding: "6px 7px",
                              }}
                            >
                              <div
                                style={{
                                  color:
                                    comparison.state === "worsening"
                                      ? RED
                                      : comparison.state === "improving"
                                        ? GREEN
                                        : comparison.state === "unchanged"
                                          ? "#8FC7FF"
                                          : AMBER,
                                  fontSize: 7,
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                }}
                              >
                                {comparison.state === "new"
                                  ? "First observed"
                                  : `Compared with prior evidence: ${comparison.state}`}
                              </div>
                              {comparison.note ? (
                                <div style={{ color: MUTED, fontSize: 7, lineHeight: 1.4, marginTop: 3 }}>
                                  {comparison.note}
                                </div>
                              ) : null}
                              {comparison.repeatability ? (
                                <div style={{ marginTop: 5, color: comparison.repeatability.comparable ? GREEN : AMBER, fontSize: 7, lineHeight: 1.4 }}>
                                  Capture repeatability {Math.round(comparison.repeatability.score)}%
                                  {comparison.repeatability.comparable
                                    ? " · comparable setup"
                                    : " · camera setup differs from baseline"}
                                  {!comparison.repeatability.comparable && comparison.repeatability.warnings.length
                                    ? ` · ${comparison.repeatability.warnings.join(" ")}`
                                    : ""}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {followUp?.needed ? (
                            <div
                              style={{
                                marginTop: 6,
                                border: `1px solid rgba(244,90,30,.35)`,
                                borderRadius: 7,
                                background: "rgba(244,90,30,.07)",
                                padding: "7px 8px",
                              }}
                            >
                              <div style={{ color: "#FFD3C0", fontSize: 8, fontWeight: 900 }}>
                                Follow-up capture recommended
                              </div>
                              {followUp.target ? (
                                <div style={{ color: GREEN, fontSize: 7, marginTop: 3 }}>
                                  Laser target {followUp.target.latitude.toFixed(6)}, {followUp.target.longitude.toFixed(6)}
                                  {followUp.target.distanceM !== null
                                    ? ` · ${followUp.target.distanceM.toFixed(1)} m`
                                    : ""}
                                </div>
                              ) : null}
                              <div style={{ color: TEXT, fontSize: 7, marginTop: 4 }}>
                                Suggested framing: about {followUp.zoom.toFixed(1)}x tighter
                              </div>
                              {followUp.reasons.length ? (
                                <div style={{ color: MUTED, fontSize: 7, lineHeight: 1.4, marginTop: 4 }}>
                                  {followUp.reasons.join(" ")}
                                </div>
                              ) : null}
                              {followUp.guidance.length ? (
                                <div style={{ display: "grid", gap: 2, marginTop: 5 }}>
                                  {followUp.guidance.map((line, index) => (
                                    <div key={index} style={{ color: MUTED, fontSize: 7, lineHeight: 1.4 }}>
                                      {index + 1}. {line}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {onPlanFollowUp ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPlanFollowUp({
                                      findingId: finding.id,
                                      findingTitle: finding.title,
                                      target: followUp.target
                                        ? {
                                            latitude: followUp.target.latitude,
                                            longitude: followUp.target.longitude,
                                            distanceM: followUp.target.distanceM ?? undefined,
                                          }
                                        : null,
                                      estimatedOpticalZoomMultiplier: followUp.zoom,
                                      focusTarget: followUp.focusTarget,
                                      reasons: followUp.reasons,
                                      guidance: followUp.guidance,
                                    })
                                  }
                                  style={{
                                    marginTop: 7,
                                    width: "100%",
                                    border: `1px solid rgba(244,90,30,.45)`,
                                    background: "rgba(244,90,30,.12)",
                                    color: "#FFD3C0",
                                    borderRadius: 7,
                                    padding: "7px 8px",
                                    fontSize: 8,
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  Plan Follow-Up Capture
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          {finding.review_status === "needs_review" ? (
                            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                              <button
                                type="button"
                                onClick={() => void reviewFinding(finding.id, "confirm")}
                                disabled={reviewBusyId === finding.id}
                                style={{
                                  border: `1px solid rgba(112,214,160,.35)`,
                                  background: "rgba(112,214,160,.09)",
                                  color: GREEN,
                                  borderRadius: 7,
                                  padding: "6px 8px",
                                  display: "inline-flex",
                                  gap: 5,
                                  alignItems: "center",
                                  fontSize: 8,
                                  fontWeight: 900,
                                  cursor: reviewBusyId === finding.id ? "wait" : "pointer",
                                }}
                              >
                                <CheckCircle2 size={11} /> Confirm Issue
                              </button>
                              <button
                                type="button"
                                onClick={() => void reviewFinding(finding.id, "dismiss")}
                                disabled={reviewBusyId === finding.id}
                                style={{
                                  border: `1px solid ${LINE}`,
                                  background: PANEL_2,
                                  color: MUTED,
                                  borderRadius: 7,
                                  padding: "6px 8px",
                                  display: "inline-flex",
                                  gap: 5,
                                  alignItems: "center",
                                  fontSize: 8,
                                  fontWeight: 900,
                                  cursor: reviewBusyId === finding.id ? "wait" : "pointer",
                                }}
                              >
                                <XCircle size={11} /> Dismiss
                              </button>
                            </div>
                          ) : finding.review_status === "confirmed" ? (
                            <div style={{ color: GREEN, fontSize: 8, fontWeight: 900, marginTop: 6 }}>
                              Tracked issue created
                            </div>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: MUTED, fontSize: 8, marginTop: 8 }}>
                      No findings linked to this image yet.
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: 11 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <PlusCircle size={14} color={ORANGE} />
          <strong style={{ color: TEXT, fontSize: 11 }}>Operator finding</strong>
        </div>
        <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.45, marginTop: 3 }}>
          Record something you can visibly support from the evidence. Operator findings are confirmed immediately and become tracked issues.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px,.8fr) minmax(120px,.55fr) minmax(0,1fr)",
            gap: 7,
            marginTop: 8,
          }}
        >
          <select
            value={manual.mediaId}
            onChange={(event) =>
              setManual((current) => ({ ...current, mediaId: event.target.value }))
            }
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL_2,
              color: TEXT,
              borderRadius: 7,
              padding: 8,
            }}
          >
            <option value="">No image link</option>
            {media.map((item) => (
              <option key={item.id} value={item.id}>
                {item.original_filename ?? item.id}
              </option>
            ))}
          </select>
          <select
            value={manual.severity}
            onChange={(event) =>
              setManual((current) => ({
                ...current,
                severity: event.target.value as ManualFindingForm["severity"],
              }))
            }
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL_2,
              color: TEXT,
              borderRadius: 7,
              padding: 8,
            }}
          >
            <option value="info">Info</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            value={manual.findingType}
            onChange={(event) =>
              setManual((current) => ({ ...current, findingType: event.target.value }))
            }
            placeholder="Finding type — corrosion, coating_damage…"
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL_2,
              color: TEXT,
              borderRadius: 7,
              padding: 8,
            }}
          />
        </div>

        <input
          value={manual.title}
          onChange={(event) =>
            setManual((current) => ({ ...current, title: event.target.value }))
          }
          placeholder="Short finding title"
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 7,
            border: `1px solid ${LINE}`,
            background: PANEL_2,
            color: TEXT,
            borderRadius: 7,
            padding: 8,
          }}
        />
        <textarea
          value={manual.description}
          onChange={(event) =>
            setManual((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="Describe only what is visibly supported by the image."
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 7,
            border: `1px solid ${LINE}`,
            background: PANEL_2,
            color: TEXT,
            borderRadius: 7,
            padding: 8,
            resize: "vertical",
          }}
        />
        <input
          value={manual.recommendedAction}
          onChange={(event) =>
            setManual((current) => ({ ...current, recommendedAction: event.target.value }))
          }
          placeholder="Recommended follow-up — closer photo, maintenance review, reinspection…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 7,
            border: `1px solid ${LINE}`,
            background: PANEL_2,
            color: TEXT,
            borderRadius: 7,
            padding: 8,
          }}
        />
        <button
          type="button"
          onClick={() => void createOperatorFinding()}
          disabled={manualBusy}
          style={{
            width: "100%",
            marginTop: 7,
            border: 0,
            background: ORANGE,
            color: "#160901",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 9,
            fontWeight: 900,
            cursor: manualBusy ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Eye size={13} />
          {manualBusy ? "Saving…" : "Record Confirmed Finding"}
        </button>

        <div
          style={{
            marginTop: 8,
            border: `1px solid rgba(255,181,101,.28)`,
            background: "rgba(255,181,101,.06)",
            borderRadius: 8,
            padding: 8,
            color: MUTED,
            fontSize: 8,
            lineHeight: 1.45,
            display: "flex",
            gap: 6,
          }}
        >
          <AlertTriangle size={12} color={AMBER} style={{ flexShrink: 0 }} />
          DOMINIC visual screening is an inspection aid. It does not certify tank integrity, diagnose a leak, or replace qualified refinery inspection/engineering judgment.
        </div>
      </div>
    </div>
  );
}
