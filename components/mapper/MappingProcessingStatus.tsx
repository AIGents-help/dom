"use client";

import { useEffect, useState } from "react";
import { V, panelStyle, btnPrimary, statusPillStyle, inputStyle, labelStyle } from "./theme";
import { canQueueProcessing, formatProgress, PROCESSING_JOB_STATUS_OPTIONS, PROCESSING_PROFILES, MAPPING_OUTPUT_OPTIONS, MAPPING_OUTPUT_PRESETS, type MappingOutputValue } from "@/lib/mapperPipeline";
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
  uploadState,
  focusModule,
}: {
  accessToken: string;
  project: Pick<MappingProject, "id" | "status" | "image_count" | "processing_progress" | "processing_stage" | "error_message">;
  latestJob: MappingProcessingJob | null;
  onQueued: () => void;
  online?: boolean;
  deliverables?: MappingDeliverable[];
  uploadState?: { total: number; done: number; inProgress: number; failed: number; duplicates: number };
  focusModule?: string | null;
}) {
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProcessingProfileValue>("standard");
  const [contourInterval, setContourInterval] = useState("0.5");
  const [outputs, setOutputs] = useState<MappingOutputValue[]>(["orthomosaic", "point_cloud"]);
  const [cancelling, setCancelling] = useState(false);

  const guard = canQueueProcessing(project);
  const uploadsBusy = !!uploadState && uploadState.inProgress > 0;
  const uploadsFailed = !!uploadState && uploadState.failed > 0;
  const outputsMissing = outputs.length === 0;
  const quickTest3dConflict = profile === "quick_test" && outputs.includes("3d_model");
  const queueBlocked = uploadsBusy || uploadsFailed || outputsMissing || quickTest3dConflict;

  const revisionRequests = deliverables.filter((item) => item.client_status === "revision_requested");
  const canReprocessRevision = project.status === "completed" && revisionRequests.length > 0;

  useEffect(() => {
    if (focusModule === "3D & Point Cloud" && !["queued", "processing", "completed"].includes(project.status)) {
      setOutputs(["3d_model", "point_cloud"]);
      setProfile("high_detail");
    }
  }, [focusModule, project.status]);


  function applyPreset(key: keyof typeof MAPPING_OUTPUT_PRESETS) {
    const preset = MAPPING_OUTPUT_PRESETS[key];
    setOutputs([...preset.outputs]);
    setProfile(preset.profile);
  }

  function toggleOutput(value: MappingOutputValue) {
    setOutputs((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      if (value === "3d_model" && !current.includes(value) && profile === "quick_test") setProfile("high_detail");
      return next;
    });
  }

  async function cancelQueuedProcessing() {
    setCancelling(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/queue`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) { setError(body.error ?? "Could not cancel queued processing."); return; }
    onQueued();
  }

  async function queueProcessing(revision = false) {
    setQueuing(true);
    setError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${project.id}/queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ profile, outputs, contour_interval_m: Number(contourInterval), revision }),
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
            <span>{project.processing_stage ?? (project.status === "queued" ? (latestJob?.worker_id ? `Claimed by ${latestJob.worker_id}` : "Waiting for a DOMINIC worker to claim this job") : "Processing")}</span>
            <span className="font-mono-ibm" style={{ color: V.telemetry }}>{formatProgress(project.processing_progress)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: V.lineSoft, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, project.processing_progress))}%`, background: V.telemetry, transition: "width .3s ease" }} />
          {project.status === "queued" && !latestJob?.worker_id && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: `1px solid ${V.warn}`, background: "rgba(229,112,31,.06)" }}>
              <p style={{ color: V.warn, fontSize: 12, fontWeight: 700 }}>No worker has claimed this job yet.</p>
              <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>DOMINIC processing runs on the separate mapper worker/NodeODM workstation. If this remains at 0%, start or restart that worker.</p>
              <button type="button" onClick={cancelQueuedProcessing} disabled={cancelling} style={{ ...btnPrimary, marginTop: 9 }}>
                {cancelling ? "Cancelling…" : "Cancel Queue & Resume Uploads"}
              </button>
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
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>What should DOMINIC produce?</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(Object.entries(MAPPING_OUTPUT_PRESETS) as [keyof typeof MAPPING_OUTPUT_PRESETS, (typeof MAPPING_OUTPUT_PRESETS)[keyof typeof MAPPING_OUTPUT_PRESETS]][]).map(([key, preset]) => (
                <button key={key} type="button" onClick={() => applyPreset(key)} style={{ ...btnPrimary, padding: "7px 10px", fontSize: 11 }}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MAPPING_OUTPUT_OPTIONS.map((item) => {
                const active = outputs.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleOutput(item.value)}
                    style={{
                      ...btnPrimary,
                      padding: "7px 10px",
                      fontSize: 11,
                      opacity: active ? 1 : 0.45,
                      filter: active ? "none" : "grayscale(1)",
                    }}
                  >
                    {active ? "✓ " : ""}{item.label}
                  </button>
                );
              })}
            </div>
          </div>

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
          {uploadsBusy && <p style={{ color: V.warn, fontSize: 11, marginBottom: 8 }}>Finish the current upload batch first: {uploadState?.done ?? 0}/{uploadState?.total ?? 0} complete, {uploadState?.inProgress ?? 0} still uploading.</p>}
          {uploadsFailed && <p style={{ color: V.danger, fontSize: 11, marginBottom: 8 }}>Retry the {uploadState?.failed ?? 0} failed upload{uploadState?.failed === 1 ? "" : "s"} before processing.</p>}
          {outputsMissing && <p style={{ color: V.warn, fontSize: 11, marginBottom: 8 }}>Select at least one output.</p>}
          {quickTest3dConflict && <p style={{ color: V.warn, fontSize: 11, marginBottom: 8 }}>Quick Test skips 3D reconstruction. Choose High Detail or remove 3D Model.</p>}
          <button onClick={() => queueProcessing(false)} disabled={queuing || !online || queueBlocked} style={{ ...btnPrimary, opacity: (!online || queueBlocked) ? .55 : 1, cursor: (!online || queueBlocked) ? "not-allowed" : "pointer" }}>
            {queuing ? "Queuing…" : project.status === "failed" ? "Retry Processing" : "Start DOMINIC Processing"}
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
