"use client";

import { useState } from "react";
import { V, panelStyle, btnPrimary, statusPillStyle, inputStyle, labelStyle } from "./theme";
import {
  canQueueProcessing,
  formatProgress,
  PROCESSING_JOB_STATUS_OPTIONS,
  PROCESSING_PROFILES,
  PROCESSING_OUTPUTS,
  PROCESSING_OUTPUT_PRESETS,
} from "@/lib/mapperPipeline";
import type { ProcessingOutputValue } from "@/lib/mapperPipeline";
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
  uploadBatchState = { total: 0, done: 0, failed: 0, duplicate: 0, inProgress: 0 },
}: {
  accessToken: string;
  project: Pick<MappingProject, "id" | "status" | "image_count" | "processing_progress" | "processing_stage" | "error_message">;
  latestJob: MappingProcessingJob | null;
  onQueued: () => void;
  online?: boolean;
  deliverables?: MappingDeliverable[];
  uploadBatchState?: { total: number; done: number; failed: number; duplicate: number; inProgress: number };
}) {
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProcessingProfileValue>("standard");
  const [requestedOutputs, setRequestedOutputs] = useState<ProcessingOutputValue[]>(["orthomosaic", "point_cloud"]);
  const [selectedPreset, setSelectedPreset] = useState<string>("map");
  const [allowPartialBatch, setAllowPartialBatch] = useState(false);
  const [contourInterval, setContourInterval] = useState("0.5");

  const guard = canQueueProcessing(project);
  const revisionRequests = deliverables.filter((item) => item.client_status === "revision_requested");
  const uploadBatchBusy = uploadBatchState.inProgress > 0;
  const uploadBatchHasFailures = uploadBatchState.failed > 0;
  const outputConflict = profile === "quick_test" && requestedOutputs.includes("3d_model")
    ? "Quick Test intentionally skips 3D model generation. Choose Standard or High Detail for a 3D model."
    : null;
  const outputsValid = requestedOutputs.length > 0;

  function applyPreset(value: string) {
    const preset = PROCESSING_OUTPUT_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setSelectedPreset(value);
    setRequestedOutputs([...preset.outputs]);
    setProfile(preset.suggestedProfile);
  }

  function toggleOutput(value: ProcessingOutputValue) {
    setSelectedPreset("custom");
    setRequestedOutputs((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  const canReprocessRevision = project.status === "completed" && revisionRequests.length > 0;

  async function queueProcessing(revision = false) {
    setQueuing(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        requested_outputs: requestedOutputs,
        contour_interval_m: Number(contourInterval),
        revision,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setQueuing(false);
    if (!res.ok) { setError(body.error ?? "Could not queue processing."); return; }
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
            <span>{project.processing_stage ?? (project.status === "queued" ? "Waiting for DOMINIC processing worker" : "Processing")}</span>
            <span className="font-mono-ibm" style={{ color: V.telemetry }}>{formatProgress(project.processing_progress)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: V.lineSoft, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, project.processing_progress))}%`, background: V.telemetry, transition: "width .3s ease" }} />
          </div>
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
          <label style={labelStyle}>What should DOMINIC produce?</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {PROCESSING_OUTPUT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyPreset(preset.value)}
                style={{
                  padding: "8px 11px",
                  borderRadius: 8,
                  border: `1px solid ${selectedPreset === preset.value ? V.signal : V.line}`,
                  background: selectedPreset === preset.value ? "rgba(244,90,30,.12)" : V.raised,
                  color: selectedPreset === preset.value ? V.signal : V.inkDim,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 650,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 8, marginBottom: 14 }}>
            {PROCESSING_OUTPUTS.map((output) => {
              const selected = requestedOutputs.includes(output.value);
              return (
                <button
                  key={output.value}
                  type="button"
                  onClick={() => toggleOutput(output.value)}
                  aria-pressed={selected}
                  style={{
                    textAlign: "left",
                    padding: "10px 11px",
                    borderRadius: 9,
                    border: `1px solid ${selected ? V.telemetry : V.line}`,
                    background: selected ? "rgba(22,163,74,.08)" : V.surface,
                    color: V.ink,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{selected ? "✓ " : ""}{output.label}</div>
                  <div style={{ color: V.inkFaint, fontSize: 10, marginTop: 3 }}>{output.description}</div>
                </button>
              );
            })}
          </div>

          {!outputsValid && <p style={{ color: V.danger, fontSize: 11, marginBottom: 10 }}>Select at least one output before processing.</p>}
          {outputConflict && <p style={{ color: V.danger, fontSize: 11, marginBottom: 10 }}>{outputConflict}</p>}

          <label style={labelStyle} htmlFor="mapper-processing-profile">Processing quality</label>
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
          {uploadBatchBusy && (
            <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${V.warn}`, marginBottom: 10, background: "rgba(245,158,11,.06)" }}>
              <p style={{ color: V.warn, fontSize: 11, fontWeight: 700 }}>
                Upload still in progress — {uploadBatchState.inProgress} file{uploadBatchState.inProgress === 1 ? "" : "s"} remaining in this batch.
              </p>
              <p style={{ color: V.inkDim, fontSize: 10, marginTop: 3 }}>Finish the upload before processing so DOMINIC does not lock an incomplete image set.</p>
            </div>
          )}

          {!uploadBatchBusy && uploadBatchHasFailures && (
            <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${V.danger}`, marginBottom: 10, background: "rgba(220,38,38,.05)" }}>
              <p style={{ color: V.danger, fontSize: 11, fontWeight: 700 }}>
                {uploadBatchState.failed} file{uploadBatchState.failed === 1 ? "" : "s"} failed in this upload batch.
              </p>
              <p style={{ color: V.inkDim, fontSize: 10, marginTop: 3 }}>Retry the failed images, or explicitly continue with only the successfully uploaded images.</p>
              <label style={{ display: "flex", alignItems: "center", gap: 7, color: V.inkDim, fontSize: 11, marginTop: 7 }}>
                <input type="checkbox" checked={allowPartialBatch} onChange={(e) => setAllowPartialBatch(e.target.checked)} />
                Process only the successfully uploaded images
              </label>
            </div>
          )}

          {!online && <p style={{ color: V.warn, fontSize: 11, marginBottom: 10 }}>Offline — processing requires a network connection.</p>}
          <button
            onClick={() => queueProcessing(false)}
            disabled={queuing || !online || uploadBatchBusy || (uploadBatchHasFailures && !allowPartialBatch) || !outputsValid || !!outputConflict}
            style={{
              ...btnPrimary,
              opacity: !online || uploadBatchBusy || (uploadBatchHasFailures && !allowPartialBatch) || !outputsValid || !!outputConflict ? .55 : 1,
              cursor: !online || uploadBatchBusy || (uploadBatchHasFailures && !allowPartialBatch) || !outputsValid || !!outputConflict ? "not-allowed" : "pointer",
            }}
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
          {latestJob.status === "queued" && !latestJob.worker_id && (
            <p style={{ color: V.warn, fontSize: 11, marginTop: 8 }}>
              This job is queued but has not started. A DOMINIC worker/NodeODM workstation must be online to claim it.
            </p>
          )}
          {latestJob.error_message && <p style={{ color: V.danger, fontSize: 12, marginTop: 8 }}>{latestJob.error_message}</p>}
        </div>
      )}
    </div>
  );
}
