"use client";

import { useState } from "react";
import { V, panelStyle, btnPrimary, statusPillStyle, inputStyle, labelStyle } from "./theme";
import { canQueueProcessing, formatProgress, PROCESSING_JOB_STATUS_OPTIONS, PROCESSING_PROFILES, DOMINIC_OUTPUT_CHOICES, DOMINIC_JOB_PRESETS, type DominicOutputType, type DominicJobPresetValue } from "@/lib/mapperPipeline";
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
}: {
  accessToken: string;
  project: Pick<MappingProject, "id" | "status" | "image_count" | "processing_progress" | "processing_stage" | "error_message">;
  latestJob: MappingProcessingJob | null;
  onQueued: () => void;
  online?: boolean;
  deliverables?: MappingDeliverable[];
}) {
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProcessingProfileValue>("standard");
  const [contourInterval, setContourInterval] = useState("0.5");
  const [jobPreset, setJobPreset] = useState<DominicJobPresetValue | "">("");
  const [requestedOutputs, setRequestedOutputs] = useState<DominicOutputType[]>([]);
  const [cancelling, setCancelling] = useState(false);

  const guard = canQueueProcessing(project);
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
        requested_outputs: requestedOutputs,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setQueuing(false);
    if (!res.ok) { setError(body.error ?? "Could not queue processing."); return; }
    onQueued();
  }

  function choosePreset(value: DominicJobPresetValue) {
    setJobPreset(value);
    const preset = DOMINIC_JOB_PRESETS.find((item) => item.value === value);
    setRequestedOutputs([...(preset?.outputs ?? [])]);
    if (preset?.profile) setProfile(preset.profile);
  }

  function toggleOutput(value: DominicOutputType) {
    setRequestedOutputs((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
    setJobPreset("custom");
  }

  async function cancelUnclaimedQueue() {
    setCancelling(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/cancel-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      setError(body.error ?? "Could not cancel the queued processing job.");
      return;
    }
    onQueued();
  }

  const canCancelUnclaimed =
    project.status === "queued"
    && latestJob?.status === "queued"
    && !latestJob.worker_id
    && !latestJob.claimed_at;

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

      {canCancelUnclaimed && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, border: `1px solid ${V.warn}`, background: "rgba(229,112,31,.05)" }}>
          <div style={{ color: V.warn, fontSize: 12, fontWeight: 700 }}>QUEUED BUT NOT CLAIMED</div>
          <p style={{ color: V.inkDim, fontSize: 12, marginTop: 5, marginBottom: 9 }}>
            No DOMINIC worker has picked this job up yet. You can cancel the queue and resume uploading images without losing the project.
          </p>
          <button type="button" onClick={cancelUnclaimedQueue} disabled={cancelling} style={btnPrimary}>
            {cancelling ? "Cancelling…" : "Cancel Queue & Resume Uploads"}
          </button>
        </div>
      )}

      {guard.ok ? (
        <div>
          <label style={labelStyle}>Job type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {DOMINIC_JOB_PRESETS.filter((preset) => preset.value !== "custom").map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => choosePreset(preset.value as DominicJobPresetValue)}
                style={{
                  ...(jobPreset === preset.value ? btnPrimary : { ...btnPrimary, background: V.raised, color: V.ink, border: `1px solid ${V.line}` }),
                  padding: "8px 10px",
                  fontSize: 11,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {jobPreset === "3d_object" && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: `1px solid ${V.telemetry}`, background: "rgba(22,163,74,.06)" }}>
              <div style={{ color: V.telemetry, fontSize: 11, fontWeight: 800 }}>OBJECT RECONSTRUCTION MODE</div>
              <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Built for close-range subjects such as equipment, vehicles and furniture. DOMINIC uses robust feature matching instead of GPS-neighbor assumptions and skips the orthophoto stage.
              </p>
            </div>
          )}

          <label style={labelStyle}>Outputs</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {DOMINIC_OUTPUT_CHOICES.map((output) => {
              const selected = requestedOutputs.includes(output.value);
              return (
                <button
                  key={output.value}
                  type="button"
                  onClick={() => toggleOutput(output.value)}
                  style={{
                    padding: "7px 9px",
                    borderRadius: 7,
                    border: `1px solid ${selected ? V.signal : V.line}`,
                    background: selected ? "rgba(244,90,30,.12)" : V.raised,
                    color: selected ? V.signal : V.inkDim,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {selected ? "✓ " : ""}{output.label}
                </button>
              );
            })}
          </div>
          {requestedOutputs.length === 0 && (
            <p style={{ color: V.warn, fontSize: 11, marginBottom: 10 }}>Choose a job type or at least one output before processing.</p>
          )}

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
          {!online && <p style={{ color: V.warn, fontSize: 11, marginBottom: 10 }}>Offline — processing requires a network connection.</p>}
          <button
            onClick={() => queueProcessing(false)}
            disabled={queuing || !online || requestedOutputs.length === 0}
            style={{
              ...btnPrimary,
              opacity: (!online || requestedOutputs.length === 0) ? .55 : 1,
              cursor: (!online || requestedOutputs.length === 0) ? "not-allowed" : "pointer",
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
          {latestJob.error_message && <p style={{ color: V.danger, fontSize: 12, marginTop: 8 }}>{latestJob.error_message}</p>}
        </div>
      )}
    </div>
  );
}
