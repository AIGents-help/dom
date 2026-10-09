"use client";

/* eslint-disable @next/next/no-img-element -- Decoded live JPEG frames change twice per second and must bypass image optimization. */

import { useEffect, useRef, useState } from "react";
import type { UniversalCameraPreviewFrame } from "@/lib/aircraft/contract";
import { PREVIEW_STALE_MS, previewImageUrl } from "@/lib/aircraft/cameraPreview";
import { projectArRegistration } from "@/lib/aircraft/arRegistration";
import DominicArOverlay from "./DominicArOverlay";
import { MAX_AUTOMATIC_PREVIEW_FRAMES, PREVIEW_SCREENING_BLOCK_LABELS, PREVIEW_SCREENING_INTERVALS, previewScreeningBlock } from "@/lib/aircraft/previewScreening";

type Props = {
  arMode?: boolean;
  preview: { frame: UniversalCameraPreviewFrame; receivedAtMs: number } | null;
  connected: boolean;
  supported: boolean;
  connecting: boolean;
  connectionError: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  canSave: boolean;
  onInspect: (frame: UniversalCameraPreviewFrame) => Promise<void>;
  onReview: () => void;
  screeningStatus: string | null;
};

export default function DominicLiveInspectionPreview(props: Props) {
  const [showAr, setShowAr] = useState(Boolean(props.arMode));
  const [decodedDimensions, setDecodedDimensions] = useState<{ frameId: string; width: number; height: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [automatic, setAutomatic] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [startedFrames, setStartedFrames] = useState(0);
  const [lastStarted, setLastStarted] = useState(0);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [environment, setEnvironment] = useState({ visible: true, online: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failedFrameId, setFailedFrameId] = useState<string | null>(null);
  const current = useRef(props);
  const options = useRef({ automatic, failedFrameId, decodedDimensions, intervalSeconds });
  const saving = useRef(false);
  const startedFramesRef = useRef(0);
  const submittedFrames = useRef(new Set<string>());
  const lastStartedAt = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { current.current = props; options.current = { automatic, failedFrameId, decodedDimensions, intervalSeconds }; });

  const inspect = async (automaticRun = false) => {
    const latest = current.current;
    const image = latest.preview?.frame;
    const key = image ? `${image.capture.aircraftId}:${image.capture.id}` : "";
    const decoded = options.current.decodedDimensions;
    const block = previewScreeningBlock({ now: Date.now(), receivedAtMs: latest.preview?.receivedAtMs ?? null,
      connected: latest.connected && latest.supported, canSave: latest.canSave, busy: saving.current,
      visible: document.visibilityState === "visible", online: navigator.onLine,
      decoded: Boolean(image && decoded?.frameId === image.capture.id && decoded.width === image.width && decoded.height === image.height && options.current.failedFrameId !== image.capture.id),
      duplicate: submittedFrames.current.has(key), automatic: automaticRun, startedFrames: startedFramesRef.current,
      lastStartedAt: lastStartedAt.current, intervalSeconds: options.current.intervalSeconds });
    if (block || !latest.preview) return;
    const frame = latest.preview.frame;
    saving.current = true;
    submittedFrames.current.add(key);
    // Bound local deduplication memory even during long manual-only sessions.
    if (submittedFrames.current.size > 100) submittedFrames.current.delete(submittedFrames.current.values().next().value!);
    setSubmittedKey(key);
    lastStartedAt.current = Date.now();
    setLastStarted(lastStartedAt.current);
    if (automaticRun) { startedFramesRef.current += 1; setStartedFrames(startedFramesRef.current); }
    setBusy(true);
    setMessage("Saving this camera frame…");
    try {
      await latest.onInspect(frame);
      if (mounted.current) setMessage("Frame saved. Review its callouts and add report notes.");
    } catch (error) {
      if (mounted.current) {
        options.current.automatic = false;
        setAutomatic(false);
        setMessage(error instanceof Error ? error.message : "Unable to save this frame.");
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const inspectRef = useRef(inspect);
  useEffect(() => { inspectRef.current = inspect; });
  useEffect(() => {
    mounted.current = true;
    const updateEnvironment = () => { setEnvironment({ visible: document.visibilityState === "visible", online: navigator.onLine }); setNow(Date.now()); };
    updateEnvironment();
    document.addEventListener("visibilitychange", updateEnvironment);
    window.addEventListener("online", updateEnvironment);
    window.addEventListener("offline", updateEnvironment);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (options.current.automatic) void inspectRef.current(true);
    }, 1000);
    return () => { mounted.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", updateEnvironment); window.removeEventListener("online", updateEnvironment); window.removeEventListener("offline", updateEnvironment); };
  }, []);

  const fresh = props.connected && props.preview && now - props.preview.receivedAtMs <= PREVIEW_STALE_MS;
  const frame = props.preview?.frame;
  const registration = frame ? projectArRegistration(frame.registration, { aircraftId: frame.capture.aircraftId, width: frame.width, height: frame.height, capturedAtMs: frame.capture.capturedAtMs, cameraSource: frame.capture.cameraSource, zoomRatio: frame.capture.zoomRatio }, now) : null;
  const imageMatches = frame && decodedDimensions?.frameId === frame.capture.id && decodedDimensions.width === frame.width && decodedDimensions.height === frame.height;
  const duplicate = Boolean(frame && submittedKey === `${frame.capture.aircraftId}:${frame.capture.id}`);
  const ready = Boolean(fresh && props.supported && props.canSave && imageMatches && failedFrameId !== frame?.capture.id && environment.visible && environment.online && !duplicate);
  // Sampling is an opt-in schedule, so a frame arriving/decoding must not disable
  // its checkbox mid-click. inspect() still gates every save on the current frame.
  const canEnableSampling = props.connected && props.supported && props.canSave && environment.visible && environment.online;
  const automaticBlock = previewScreeningBlock({ now, receivedAtMs: props.preview?.receivedAtMs ?? null, connected: props.connected && props.supported, canSave: props.canSave, decoded: Boolean(imageMatches && failedFrameId !== frame?.capture.id), busy, visible: environment.visible, online: environment.online, duplicate, automatic: true, startedFrames, lastStartedAt: lastStarted, intervalSeconds });
  const arMarkers = showAr && fresh && imageMatches && failedFrameId !== frame?.capture.id ? registration?.markers ?? [] : [];
  return <div style={{ padding: 16, color: "#F5F7FA" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <strong>Live inspection camera</strong>
      <span role="status" style={{ color: fresh ? "#70D6A0" : "#FFB86B", fontSize: 12 }}>
        {!props.connected ? "Aircraft disconnected" : !props.supported ? "Install the preview-enabled DJI inspection bridge" : fresh ? "Camera preview connected" : "Waiting for current camera frames"}
      </span>
    </div>
    <div style={{ marginBottom: 12 }}>
      <button type="button" disabled={props.connecting} onClick={() => void (props.connected ? props.onDisconnect() : props.onConnect())} style={{ background: props.connected ? "#1C242D" : "#F45A1E", color: "#FFF", border: 0, borderRadius: 8, padding: "10px 14px", cursor: props.connecting ? "wait" : "pointer" }}>{props.connected ? "Disconnect Aircraft Bridge" : props.connecting ? "Connecting…" : "Connect Aircraft Bridge"}</button>
      {props.connectionError ? <p role="alert" style={{ color: "#FFB86B" }}>{props.connectionError}</p> : null}
    </div>
    <div style={{ background: "#090D12", minHeight: 280, position: "relative", display: "grid", placeItems: "center" }}>
      {props.preview ? <div style={{ position: "relative", width: "100%", maxWidth: 560 * props.preview.frame.width / props.preview.frame.height }}>
        <img key={props.preview.frame.capture.id} src={previewImageUrl(props.preview.frame)} alt="Current aircraft camera preview" onLoad={(event) => setDecodedDimensions({ frameId: props.preview!.frame.capture.id, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailedFrameId(props.preview!.frame.capture.id)} style={{ display: "block", width: "100%", opacity: fresh ? 1 : 0.35 }} />
        {arMarkers.length ? <DominicArOverlay markers={arMarkers} width={props.preview.frame.width} height={props.preview.frame.height} /> : null}
      </div> : <p style={{ padding: 24, color: "#A7B0BA" }}>Connect your DJI inspection bridge to see the aircraft camera.</p>}
      {props.preview && !fresh ? <strong style={{ position: "absolute", background: "#090D12", padding: 12 }}>Preview paused — frame inspection unavailable</strong> : null}
    </div>
    <label style={{ display: "block", fontSize: 13, marginTop: 12 }}><input type="checkbox" checked={showAr} onChange={(event) => setShowAr(event.target.checked)} /> Show calibrated AR</label>
    {showAr ? <div aria-label="AR registration status" style={{ fontSize: 12, lineHeight: 1.6, color: "#FFB86B", marginTop: 8 }}>
      <p>{!fresh ? "AR hidden — current camera preview required" : !imageMatches ? "AR hidden — decoded image dimensions do not match calibration" : registration?.status}</p>
      <p>Only rectified, calibrated frames with synchronized camera pose and surveyed anchors can show projections. Aircraft heading alone is insufficient. Markers do not establish visibility, obstruction clearance or a confirmed defect. Physical alignment must be verified.</p>
    </div> : null}
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
      <button type="button" disabled={!ready || busy} onClick={() => void inspect()} style={{ padding: "10px 14px", background: ready && !busy ? "#F45A1E" : "#39424B", color: "#FFF", border: 0, borderRadius: 8, cursor: ready && !busy ? "pointer" : "not-allowed" }}>{busy ? "Saving & screening…" : "Inspect this frame"}</button>
      <label style={{ fontSize: 13 }}>Preview screening cadence <select aria-label="Preview screening cadence" value={intervalSeconds} onChange={(event) => { const seconds = Number(event.target.value); options.current.intervalSeconds = seconds; setIntervalSeconds(seconds); lastStartedAt.current = Date.now(); setLastStarted(lastStartedAt.current); }} style={{ background: "#1C242D", color: "#FFF", border: "1px solid #39424B", padding: 8, borderRadius: 6 }}>{PREVIEW_SCREENING_INTERVALS.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={automatic} disabled={!canEnableSampling && !automatic} onChange={(event) => { lastStartedAt.current = Date.now(); setLastStarted(lastStartedAt.current); if (event.target.checked) { startedFramesRef.current = 0; setStartedFrames(0); } options.current.automatic = event.target.checked; setAutomatic(event.target.checked); }} /> Sample for inspection every {intervalSeconds} seconds</label>
      <button type="button" disabled={!props.canSave} onClick={props.onReview} style={{ background: "#1C242D", color: "#FFF", border: "1px solid #39424B", borderRadius: 8, padding: "10px 14px", cursor: props.canSave ? "pointer" : "not-allowed" }}>Review frames & report</button>
    </div>
    {automatic ? <p role="status" aria-label="Automatic preview screening status" style={{ color: "#FFB86B", fontSize: 13 }}>Automatic run: {startedFrames}/{MAX_AUTOMATIC_PREVIEW_FRAMES} frames started. {automaticBlock ? PREVIEW_SCREENING_BLOCK_LABELS[automaticBlock] : "Next current frame is ready"}.</p> : null}
    <p style={{ color: "#A7B0BA", fontSize: 12, lineHeight: 1.6 }}>Opt-in RGB preview sampling, not every-frame video analysis. Faster intervals save more evidence and may increase AI charges. Each run is capped at 30 frames, waits for the previous screening job, skips duplicate frames, and pauses while this tab is hidden, offline, or frames are stale. AI errors stop sampling. Callouts stay on the saved image and require review; they are not tracked live defects. Use full resolution still captures for detail.</p>
    {!props.canSave ? <p>Select a project asset and inspection before saving evidence.</p> : null}
    {message ? <p role="status" style={{ fontSize: 13 }}>{message}</p> : null}
    {props.screeningStatus ? <p role="status" style={{ color: "#FFB86B", fontSize: 13 }}>{props.screeningStatus}</p> : null}
  </div>;
}
