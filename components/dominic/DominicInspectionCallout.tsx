"use client";

/* eslint-disable @next/next/no-img-element -- private signed inspection evidence */
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { findingMediaId, type InspectionFinding, type InspectionReportData } from "@/lib/dominicInspectionEvidence";
import { V, btnGhost } from "@/components/mapper/theme";

export default function DominicInspectionCallout({ finding, inspectionId, onClose, onSaved }: {
  finding: InspectionFinding; inspectionId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(typeof finding.detector.reportNote === "string" ? finding.detector.reportNote : "");
  const [included, setIncluded] = useState(finding.detector.reportIncluded !== false);
  const [data, setData] = useState<InspectionReportData | null>(null);
  const [opacity, setOpacity] = useState(50);
  const [overlay, setOverlay] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    dialogRef.current?.showModal();
    let active = true;
    (async () => {
      const { data: session } = await getSupabaseBrowser().auth.getSession();
      const response = await fetch(`/api/dominic/inspections/${inspectionId}/report`, { headers: { Authorization: `Bearer ${session.session?.access_token ?? ""}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Evidence unavailable.");
      if (active) setData(body);
    })().catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Evidence unavailable."); });
    return () => { active = false; };
  }, [inspectionId]);
  const current = data?.media.find((item) => item.id === findingMediaId(finding));
  const baseline = data?.baselineMedia.find((item) => item.id === finding.detector.baselineSourceMediaId);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const { data: session } = await getSupabaseBrowser().auth.getSession();
      const response = await fetch(`/api/dominic/findings/${finding.id}/report-note`, {
        method: "PATCH", headers: { Authorization: `Bearer ${session.session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note, included }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the note.");
      await onSaved(); setMessage("Report note saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the note."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="inspection-callout-title"
    style={{ width: "min(900px,calc(100vw - 28px))", maxHeight: "90vh", overflow: "auto", padding: 20, background: V.surface, color: V.ink, border: `1px solid ${V.line}`, borderRadius: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2 id="inspection-callout-title" style={{ fontSize: 21 }}>{finding.title}</h2><button type="button" style={btnGhost} onClick={onClose}>Close callout</button></div>
    <p style={{ fontSize: 13, color: V.inkDim }}>{finding.severity} · {finding.review_status.replaceAll("_", " ")} · {finding.confidence === null ? finding.detector.provider === "operator" ? "Operator observation" : "Confidence not recorded" : `${Math.round(finding.confidence * 100)}% model confidence`}</p>
    <p>{finding.description}</p>
    {current?.url ? <figure style={{ margin: 0 }}>
      <div style={{ position: "relative", overflow: "hidden", background: "#090D11" }}>
        <img src={current.url} alt="Current inspection evidence" style={{ display: "block", width: "100%" }} />
        {overlay && baseline?.url ? <img src={baseline.url} alt="Previous evidence overlay" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: opacity / 100, transform: `translate(${offsetX}%,${offsetY}%) scale(${scale / 100})` }} /> : null}
      </div><figcaption style={{ fontSize: 12, color: V.inkDim }}>Current · {current.captured_at ?? current.created_at}</figcaption>
    </figure> : <p style={{ color: V.inkDim }}>{data ? "No source image is linked to this finding." : "Loading source evidence…"}</p>}
    {baseline?.url ? <section aria-label="Previous image comparison" style={{ marginTop: 16 }}>
      <h3>Previous inspection evidence</h3>
      <button type="button" style={btnGhost} aria-pressed={overlay} onClick={() => setOverlay(!overlay)}>{overlay ? "Show images separately" : "Overlay previous image"}</button>
      {overlay ? <>
        <p style={{ fontSize: 12, color: V.inkDim }}>Manual visual alignment. Differences in viewpoint, lighting and image shape can mimic defects; this overlay does not automatically verify a discrepancy.</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>Previous image opacity<input aria-label="Previous image opacity" type="range" min="0" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
          <label>Previous image scale<input aria-label="Previous image scale" type="range" min="50" max="200" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
          <label>Horizontal alignment<input aria-label="Horizontal alignment" type="range" min="-50" max="50" value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} /></label>
          <label>Vertical alignment<input aria-label="Vertical alignment" type="range" min="-50" max="50" value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} /></label>
        </div>
      </> : <img src={baseline.url} alt="Previous inspection evidence" style={{ display: "block", width: "100%", marginTop: 12 }} />}
      <p style={{ fontSize: 12 }}>{typeof finding.detector.comparisonNote === "string" ? finding.detector.comparisonNote : "No comparison assessment recorded."}</p>
    </section> : <p style={{ fontSize: 12, color: V.inkDim }}>No prior comparison image linked to this finding.</p>}
    <label style={{ display: "grid", gap: 8, marginTop: 20 }}>Note for report<textarea aria-label="Note for report" maxLength={2000} rows={4} value={note} onChange={(e) => setNote(e.target.value)} style={{ padding: 10, background: "#090D11", color: V.ink, border: `1px solid ${V.line}`, borderRadius: 8 }} /></label>
    <label style={{ display: "flex", gap: 8, margin: "14px 0" }}><input type="checkbox" checked={included} onChange={(e) => setIncluded(e.target.checked)} />Include finding and linked images in report</label>
    <button type="button" disabled={busy} style={btnGhost} onClick={() => void save()}>{busy ? "Saving…" : "Save report note"}</button>
    {message ? <p role="status">{message}</p> : null}
  </dialog>;
}
