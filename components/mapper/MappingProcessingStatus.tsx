"use client";

import { useEffect, useState } from "react";
import { V, panelStyle, btnPrimary, statusPillStyle, inputStyle, labelStyle } from "./theme";
import {
  canQueueProcessing,
  DOMINIC_OUTPUT_OPTIONS,
  DOMINIC_OUTPUT_PRESETS,
  formatProgress,
  PROCESSING_JOB_STATUS_OPTIONS,
  PROCESSING_PROFILES,
} from "@/lib/mapperPipeline";
import type { DominicOutputValue } from "@/lib/mapperPipeline";
import type { MappingDeliverable, MappingProject, MappingProcessingJob, ProcessingProfileValue } from "./types";

const JOB_STATUS_COLOR: Record<string, string> = {
  queued: "#E5701F", claimed: "#16A34A", processing: "#16A34A",
  completed: "#16A34A", failed: "#DC2626", cancelled: "#5F6B7A",
};

export default function MappingProcessingStatus({
  accessToken,
  project,
  latestJob,
  onQueued,
  online = true,
  deliverables = [],
  uploadsInProgress = 0,
  uploadFailures = 0,
}: {
  accessToken: string;
  project: Pick<MappingProject, "id" | "status" | "image_count" | "processing_progress" | "processing_stage" | "error_message">;
  latestJob: MappingProcessingJob | null;
  onQueued: () => void;
  online?: boolean;
  deliverables?: MappingDeliverable[];
  uploadsInProgress?: number;
  uploadFailures?: number;
}) {
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProcessingProfileValue>("standard");
  const [contourInterval, setContourInterval] = useState("0.5");
  const [selectedOutputs, setSelectedOutputs] = useState<DominicOutputValue[]>(["orthomosaic", "point_cloud"]);
  const [uploadCompleteConfirmed, setUploadCompleteConfirmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const guard = canQueueProcessing(project);
  const canCancelQueued = project.status === "queued" && latestJob?.status === "queued" && !latestJob.worker_id;
  const queueBlocked = uploadsInProgress > 0 || uploadFailures > 0 || !uploadCompleteConfirmed || selectedOutputs.length === 0;

  useEffect(() => {
    setUploadCompleteConfirmed(false);
  }, [project.image_count]);

  function applyOutputPreset(outputs: readonly DominicOutputValue[]) {
    setSelectedOutputs([...outputs]);
  }

  function toggleOutput(output: DominicOutputValue) {
    setSelectedOutputs((current) => current.includes(output)
      ? current.filter((item) => item !== output)
      : [...current, output]);
  }
  const revisionRequests = deliverables.filter((item) => item.client_status === "revision_requested");
  const canReprocessRevision = project.status === "completed" && revisionRequests.length > 0;

  async function queueProcessing(revision = false) {
    setQueuing(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        contour_interval_m: Number(contourInterval),
        revision,
        requested_outputs: selectedOutputs,
        upload_complete_confirmed: uploadCompleteConfirmed,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setQueuing(false);
    if (!res.ok) { setError(body.error ?? "Could not queue processing."); return; }
    onQueued();
  }

  async function cancelQueuedJob() {
    setCancelling(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/queue/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      setError(body.error ?? "Could not cancel the queued processing job.");
      return;
    }
    setUploadCompleteConfirmed(false);
    onQueued();
  }

  return (
    <div style={panelStyle}>
      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10 }}>
        Processing
      </div>

      {(project.status === "processing" || project.status === "queued") && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: V.inkDim, marginBottom: 6 }}>
            <span>{project.processing_stage ?? (project.status === "queued" ? "Waiting for a worker to pick this up" : "Processing")}</span>
            <span className="font-mono-ibm" style={{ color: V.telemetry }}>{formatProgress(project.processing_progress)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: V.lineSoft, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, project.processing_progress))}%`, background: V.telemetry, transition: "width .3s ease" }} />
          </div>
          {canCancelQueued && (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={cancelQueuedJob} disabled={cancelling} style={{ ...btnPrimary, background: V.warn }}>
                {cancelling ? "Cancelling…" : "Cancel Queued Job & Reopen Uploads"}
              </button>
              <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 6 }}>
                Safe while no worker has claimed the job. Your uploaded imagery is kept.
              </p>
            </div>
          )}
        </div>
      )}

      {project.status === "failed" && project.error_message && (
        <p style={{ color: V.danger, fontSize: 13, marginBottom: 12 }}>{project.error_message}</p>
      )}

      {error && <p style={{ color: V.signal, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {canReprocessRevision && (
        <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, border: `1px solid ${V.warn}` }}>
          <div style={{ color: V.warn, fontSize: 12, fontWeight: 700, marginBottom: 5 }}>CLIENT REVISION REQUESTED</div>
          <p style={{ color: V.inkDim, fontSize: 12, marginBottom: 8 }}>{revisionRequests.length} current output{revisionRequests.length === 1 ? "" : "s"} require correction. Reprocessing creates new revision versions and preserves the prior client review history.</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {revisionRequests.map((item) => (
              <div key={item.id} style={{ padding: 8, borderRadius: 6, background: V.raised, fontSize: 11 }}>
                <div style={{ color: V.ink, fontWeight: 600 }}>{item.name}</div>
                {item.client_feedback ? <div style={{ color: V.warn, marginTop: 3 }}>Client: {item.client_feedback}</div> : null}
              </div>
            ))}
          </div>
          {!online && <p style={{ color: V.warn, fontSize: 11, marginBottom: 8 }}>Reconnect before starting corrected processing.</p>}
          <button onClick={() => queueProcessing(true)} disabled={queuing || !online} style={{ ...btnPrimary, opacity: !online ? .55 : 1, cursor: !online ? "not-allowed" : "pointer" }}>
            {queuing ? "Queuing…" : "Process Corrected Revision"}
          </button>
        </div>
      )}

      {guard.ok ? (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div className="font-saira" style={{ color: V.ink, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              What do you want DOMINIC to produce?
            </div>
            <p style={{ color: V.inkDim, fontSize: 11, marginBottom: 9 }}>
              Choose a preset, then click individual outputs on or off. The left-side 3D & Point Cloud item is the viewer for finished results — it does not select the processing job.
            </p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {DOMINIC_OUTPUT_PRESETS.map((preset) => {
                const active = preset.outputs.length === selectedOutputs.length && preset.outputs.every((output) => selectedOutputs.includes(output));
                return (
                  <button
                    type="button"
                    key={preset.value}
                    onClick={() => applyOutputPreset(preset.outputs)}
                    title={preset.description}
                    style={{
                      ...btnPrimary,
                      padding: "7px 10px",
                      fontSize: 11,
                      background: active ? V.signal : V.raised,
                      color: active ? "#fff" : V.inkDim,
                      border: `1px solid ${active ? V.signal : V.line}`,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {DOMINIC_OUTPUT_OPTIONS.map((output) => {
                const active = selectedOutputs.includes(output.value);
                return (
                  <button
                    type="button"
                    key={output.value}
                    onClick={() => toggleOutput(output.value)}
                    style={{
                      ...btnPrimary,
                      padding: "7px 10px",
                      fontSize: 11,
                      background: active ? "rgba(22,163,74,.12)" : V.raised,
                      color: active ? V.telemetry : V.inkDim,
                      border: `1px solid ${active ? V.telemetry : V.line}`,
                    }}
                  >
                    {active ? "✓ " : ""}{output.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={labelStyle} htmlFor="mapper-processing-profile">Quality / processing profile</label>
          <select
            id="mapper-processing-profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value as ProcessingProfileValue)}
            style={{ ...inputStyle, marginBottom: 10, maxWidth: 320 }}
          >
            {PROCESSING_PROFILES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <p style={{ color: V.inkFaint, fontSize: 12, marginBottom: 12, maxWidth: 420 }}>
            {PROCESSING_PROFILES.find((p) => p.value === profile)?.description}
          </p>
          {profile === "survey" && (
            <div style={{ marginBottom: 12, maxWidth: 220 }}>
              <label style={labelStyle} htmlFor="mapper-contour-interval">Contour interval</label>
              <select
                id="mapper-contour-interval"
                value={contourInterval}
                onChange={(e) => setContourInterval(e.target.value)}
                style={inputStyle}
              >
                <option value="0.25">0.25 m</option>
                <option value="0.5">0.5 m</option>
                <option value="1">1 m</option>
                <option value="2">2 m</option>
                <option value="5">5 m</option>
              </select>
            </div>
          )}
          <div style={{ marginBottom: 12, padding: 10, border: `1px solid ${uploadsInProgress > 0 || uploadFailures > 0 ? V.warn : V.line}`, borderRadius: 8, background: V.raised }}>
            {uploadsInProgress > 0 && (
              <p style={{ color: V.warn, fontSize: 11, marginBottom: 6 }}>
                {uploadsInProgress} image upload{uploadsInProgress === 1 ? " is" : "s are"} still in progress. Processing stays locked until uploads finish.
              </p>
            )}
            {uploadFailures > 0 && (
              <p style={{ color: V.danger, fontSize: 11, marginBottom: 6 }}>
                {uploadFailures} image upload{uploadFailures === 1 ? " has" : "s have"} failed. Retry or resolve failed uploads before processing.
              </p>
            )}
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: V.inkDim, fontSize: 11, cursor: uploadsInProgress > 0 || uploadFailures > 0 ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={uploadCompleteConfirmed}
                disabled={uploadsInProgress > 0 || uploadFailures > 0}
                onChange={(event) => setUploadCompleteConfirmed(event.target.checked)}
              />
              <span>I confirm all intended source images have finished uploading. Current confirmed image count: <strong style={{ color: V.ink }}>{project.image_count}</strong>.</span>
            </label>
          </div>
          {!online && <p style={{ color: V.warn, fontSize: 11, marginBottom: 10 }}>Offline — processing requires a network connection.</p>}
          {selectedOutputs.length === 0 && <p style={{ color: V.warn, fontSize: 11, marginBottom: 10 }}>Select at least one output before processing.</p>}
          <button
            onClick={() => queueProcessing(false)}
            disabled={queuing || !online || queueBlocked}
            style={{ ...btnPrimary, opacity: (!online || queueBlocked) ? .5 : 1, cursor: (!online || queueBlocked) ? "not-allowed" : "pointer" }}
          >
            {queuing ? "Queuing…" : project.status === "failed" ? "Retry Processing" : "Queue Processing"}
          </button>
        </div>
      ) : (
        !["processing", "queued", "completed"].includes(project.status) && (
          <p style={{ color: V.inkFaint, fontSize: 12 }}>{guard.reason}</p>
        )
      )}

      {latestJob && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.lineSoft}` }}>
          <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>Latest processing job</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span className="font-mono-ibm" style={statusPillStyle(JOB_STATUS_COLOR[latestJob.status] ?? V.inkFaint)}>
              {PROCESSING_JOB_STATUS_OPTIONS.find((s) => s.value === latestJob.status)?.label ?? latestJob.status}
            </span>
            <span style={{ color: V.inkFaint }}>Attempt {latestJob.attempts + 1}</span>
            {latestJob.profile && (
              <span style={{ color: V.inkFaint }}>
                Profile: {PROCESSING_PROFILES.find((p) => p.value === latestJob.profile)?.label ?? latestJob.profile}
              </span>
            )}
            {latestJob.worker_id && <span style={{ color: V.inkFaint }}>Worker: {latestJob.worker_id}</span>}
            {latestJob.current_stage && <span style={{ color: V.inkDim }}>{latestJob.current_stage}</span>}
          </div>
          {latestJob.error_message && <p style={{ color: V.danger, fontSize: 12, marginTop: 8 }}>{latestJob.error_message}</p>}
        </div>
      )}
    </div>
  );
}
