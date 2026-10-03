"use client";

/* eslint-disable @next/next/no-img-element -- Decoded live JPEG frames change twice per second and must bypass image optimization. */

import { useEffect, useRef, useState } from "react";
import type { UniversalCameraPreviewFrame } from "@/lib/aircraft/contract";
import { PREVIEW_STALE_MS, previewImageUrl } from "@/lib/aircraft/cameraPreview";

type Props = {
  preview: { frame: UniversalCameraPreviewFrame; receivedAtMs: number } | null;
  connected: boolean;
  supported: boolean;
  canSave: boolean;
  onInspect: (frame: UniversalCameraPreviewFrame) => Promise<void>;
  onReview: () => void;
  screeningStatus: string | null;
};

export default function DominicLiveInspectionPreview(props: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [automatic, setAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failedFrameId, setFailedFrameId] = useState<string | null>(null);
  const current = useRef(props);
  const options = useRef({ automatic, failedFrameId });
  const saving = useRef(false);
  const lastStartedAt = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { current.current = props; options.current = { automatic, failedFrameId }; });

  const inspect = async () => {
    const latest = current.current;
    if (saving.current || !latest.connected || !latest.canSave || !latest.preview ||
        Date.now() - latest.preview.receivedAtMs > PREVIEW_STALE_MS ||
        options.current.failedFrameId === latest.preview.frame.capture.id) return;
    const frame = latest.preview.frame;
    saving.current = true;
    lastStartedAt.current = Date.now();
    setBusy(true);
    setMessage("Saving this camera frame…");
    try {
      await latest.onInspect(frame);
      if (mounted.current) setMessage("Frame saved. Review its callouts and add report notes below.");
    } catch (error) {
      if (mounted.current) {
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
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (options.current.automatic && Date.now() - lastStartedAt.current >= 30_000) void inspectRef.current();
    }, 1000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);

  const fresh = props.connected && props.preview && now - props.preview.receivedAtMs <= PREVIEW_STALE_MS;
  const ready = Boolean(fresh && props.canSave && failedFrameId !== props.preview?.frame.capture.id);
  return <div style={{ padding: 16, color: "#F5F7FA" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <strong>Live inspection camera</strong>
      <span role="status" style={{ color: fresh ? "#70D6A0" : "#FFB86B", fontSize: 12 }}>
        {!props.connected ? "Aircraft disconnected" : !props.supported ? "Install the preview-enabled DJI inspection bridge" : fresh ? "Camera preview connected" : "Waiting for current camera frames"}
      </span>
    </div>
    <div style={{ background: "#090D12", minHeight: 280, position: "relative", display: "grid", placeItems: "center" }}>
      {props.preview ? <img src={previewImageUrl(props.preview.frame)} alt="Current aircraft camera preview" onError={() => setFailedFrameId(props.preview!.frame.capture.id)} style={{ display: "block", width: "100%", maxHeight: 560, objectFit: "contain", opacity: fresh ? 1 : 0.35 }} /> : <p style={{ padding: 24, color: "#A7B0BA" }}>Connect your DJI inspection bridge to see the aircraft camera.</p>}
      {props.preview && !fresh ? <strong style={{ position: "absolute", background: "#090D12", padding: 12 }}>Preview paused — frame inspection unavailable</strong> : null}
    </div>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
      <button type="button" disabled={!ready || busy} onClick={() => void inspect()} style={{ padding: "10px 14px" }}>{busy ? "Saving & screening…" : "Inspect this frame"}</button>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={automatic} disabled={!ready && !automatic} onChange={(event) => { lastStartedAt.current = Date.now(); setAutomatic(event.target.checked); }} /> Sample for inspection every 30 seconds</label>
      <button type="button" disabled={!props.canSave} onClick={props.onReview}>Review frames & report</button>
    </div>
    <p style={{ color: "#A7B0BA", fontSize: 12, lineHeight: 1.6 }}>Low rate camera preview. Inspection saves an RGB preview image and screens it when AI is configured; results stay on that saved image. Use full resolution still captures for detail. Sampling waits for each screening job and pauses when frames stop.</p>
    {!props.canSave ? <p>Select a project asset and inspection before saving evidence.</p> : null}
    {message ? <p role="status" style={{ fontSize: 13 }}>{message}</p> : null}
    {props.screeningStatus ? <p role="status" style={{ color: "#FFB86B", fontSize: 13 }}>{props.screeningStatus}</p> : null}
  </div>;
}
