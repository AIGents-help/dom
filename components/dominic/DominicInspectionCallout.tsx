"use client";

/* eslint-disable @next/next/no-img-element -- private signed inspection evidence */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FileText, ImageOff, Layers2, Maximize2, RotateCcw, Save, X, ZoomIn, ZoomOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { findingImageRegion, findingMediaId, type InspectionFinding, type InspectionReportData } from "@/lib/dominicInspectionEvidence";
import { assertPhotoReviewReport, photoCaptureTime, photoReportDraft, photoReviewStatus } from "@/lib/dominicPhotoReview.mjs";
import styles from "./DominicPhotoReview.module.css";

type Props = { finding: InspectionFinding; inspectionId: string; onClose: () => void; onSaved: () => Promise<void> };
export default function DominicInspectionCallout(props: Props) {
  return <PhotoReview key={`${props.inspectionId}:${props.finding.id}`} {...props} />;
}
function PhotoReview({ finding, inspectionId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const writing = useRef(false);
  const draftInitialized = useRef(false);
  const [draft, setDraft] = useState(() => photoReportDraft(finding.detector));
  const [savedDraft, setSavedDraft] = useState(() => photoReportDraft(finding.detector));
  const [data, setData] = useState<InspectionReportData | null>(null);
  const [reviewStatus, setReviewStatus] = useState(finding.review_status);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"note" | "confirm" | "dismiss" | null>(null);
  const [reload, setReload] = useState(0);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [baselineError, setBaselineError] = useState(false);
  const [showRegion, setShowRegion] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(100);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = draft.note !== savedDraft.note || draft.included !== savedDraft.included;

  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => { alive.current = false; dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 20000);
    (async () => {
      setLoading(true); setLoadError(""); setData(null); setImageReady(false); setImageError(false); setBaselineError(false);
      const { data: session, error } = await getSupabaseBrowser().auth.getSession();
      const token = session.session?.access_token;
      if (error || !token) throw new Error("Your session expired. Sign in again to review the evidence.");
      if (!active) return;
      if (controller.signal.aborted) throw new Error("The evidence took too long to load.");
      const response = await fetch(`/api/dominic/inspections/${encodeURIComponent(inspectionId)}/report?findingId=${encodeURIComponent(finding.id)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The evidence could not be loaded.");
      assertPhotoReviewReport(body, inspectionId, finding.id);
      if (!active) return;
      const report = body as InspectionReportData;
      const fresh = report.findings.find((row) => row.id === finding.id)!;
      setData(report); setReviewStatus(fresh.review_status);
      if (!draftInitialized.current) {
        const initial = photoReportDraft(fresh.detector);
        setDraft(initial); setSavedDraft(initial); draftInitialized.current = true;
      }
    })().catch((error) => {
      if (active) setLoadError(controller.signal.aborted ? "The evidence took too long to load. Try again." : error instanceof Error ? error.message : "The evidence could not be loaded.");
    }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [inspectionId, finding.id, reload]);

  const selected = data?.findings.find((row) => row.id === finding.id) ?? finding;
  const current = data?.media.find((item) => item.id === findingMediaId(selected));
  const baseline = data?.baselineMedia.find((item) => item.id === selected.detector?.baselineSourceMediaId);
  const region = findingImageRegion(selected);
  const status = photoReviewStatus(reviewStatus);
  const ready = !loading && !loadError && Boolean(data);
  function close() {
    if (writing.current) return;
    if (dirty) { setConfirmClose(true); return; }
    onClose();
  }
  async function persist(kind: "note" | "confirm" | "dismiss") {
    if (writing.current || !ready || (kind !== "note" && (!status.canReview || !imageReady || imageError || dirty))) return;
    writing.current = true; setBusy(kind); setMessage(""); setWriteError(""); setConfirmClose(false);
    const snapshot = { note: draft.note.trim(), included: draft.included };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let committed = false;
    try {
      const { data: session, error } = await getSupabaseBrowser().auth.getSession();
      const token = session.session?.access_token;
      if (error || !token) throw new Error("Your session expired. Sign in again before saving.");
      if (!alive.current || controller.signal.aborted) throw new Error("The save could not start. Your draft is still here.");
      const response = await fetch(`/api/dominic/findings/${encodeURIComponent(finding.id)}/${kind === "note" ? "report-note" : "review"}`, {
        method: kind === "note" ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(kind === "note" ? snapshot : { action: kind }), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The change could not be saved.");
      if (kind === "note" && body.saved !== true) throw new Error("The note save was not confirmed. Reopen the finding to check it.");
      committed = true;
      if (!alive.current) return;
      if (kind === "note") { setDraft(snapshot); setSavedDraft(snapshot); }
      else setReviewStatus(kind === "confirm" ? "confirmed" : "dismissed");
      setMessage(kind === "note" ? "Report note saved." : kind === "confirm" ? "Finding confirmed." : "Finding dismissed.");
      await onSaved();
    } catch (error) {
      if (alive.current) setWriteError(committed ? "Your change was saved, but the inspection list could not refresh. Reopen the inspection to check its latest state." : controller.signal.aborted ? "The save could not be verified. Reopen this finding before retrying; your draft is still here." : error instanceof Error ? error.message : "The change could not be saved. Your draft is still here.");
    } finally { clearTimeout(timer); writing.current = false; if (alive.current) setBusy(null); }
  }
  const confidence = selected.confidence;
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="inspection-callout-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className={styles.header}>
      <div className={styles.titleBlock}><p className={styles.eyebrow}>INSPECTION <ChevronRight size={12} /> PHOTO REVIEW</p><h2 id="inspection-callout-title" ref={titleRef} tabIndex={-1}>{selected.title}</h2><p className={styles.assetName}>{data?.asset.name ?? "Opening inspection evidence"}</p></div>
      <button type="button" className={styles.close} aria-label="Close callout" title="Close photo review" disabled={Boolean(busy)} onClick={close}><X size={20} /></button>
    </header>
    {confirmClose && <section className={styles.closePrompt} aria-label="Unsaved report note"><p>Your report note has unsaved changes.</p><button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard unsaved note</button></section>}
    <div className={styles.columns}>
      <section className={styles.visualPanel} aria-label="Inspection photograph">
        <div className={styles.imageToolbar}><span>Saved evidence</span><div className={styles.zoomTools}><button type="button" aria-label="Zoom out" disabled={zoom === 100 || !imageReady} onClick={() => setZoom((n) => n - 50)}><ZoomOut size={17} /></button><button type="button" aria-label="Fit image" disabled={!imageReady} onClick={() => setZoom(100)}><Maximize2 size={15} /> {zoom}%</button><button type="button" aria-label="Zoom in" disabled={zoom === 300 || !imageReady} onClick={() => setZoom((n) => n + 50)}><ZoomIn size={17} /></button></div></div>
        {loadError ? <div className={styles.imageEmpty} role="alert"><ImageOff size={32} /><h3>Evidence unavailable</h3><p>{loadError}</p><button type="button" onClick={() => setReload((n) => n + 1)}>Try loading again</button></div> : current?.url ? <>
          <div className={styles.imageViewport}>
            <div className={styles.imageStage} style={{ width: `${zoom}%` }}>
              <img key={current.url} src={current.url} alt="Current inspection evidence" className={styles.currentImage} onLoad={() => { setImageReady(true); setImageError(false); }} onError={() => { setImageReady(false); setImageError(true); }} />
              {overlay && baseline?.url && !baselineError && <img src={baseline.url} alt="Previous evidence overlay" className={styles.overlayImage} style={{ opacity: opacity / 100, transform: `translate(${offsetX}%,${offsetY}%) scale(${scale / 100})` }} onError={() => setBaselineError(true)} />}
              {imageReady && !imageError && showRegion && region && <div className={styles.region} role="img" aria-label="Marked finding area" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
            </div>
          </div>
          {imageError ? <div role="alert" className={styles.imageFailure}>This saved image could not be displayed. <button type="button" onClick={() => setReload((n) => n + 1)}>Reload evidence</button></div> : <p className={styles.caption}>{current.original_filename ?? "Source photograph"}<span>{photoCaptureTime(current.captured_at)}</span></p>}
          <div className={styles.viewActions}>{region && <button type="button" aria-pressed={showRegion} disabled={!imageReady} onClick={() => setShowRegion((n) => !n)}>{showRegion ? "Hide marked area" : "Show marked area"}</button>}{baseline?.url && <button type="button" aria-pressed={overlay} disabled={!imageReady || baselineError} onClick={() => setOverlay((n) => !n)}><Layers2 size={15} />{overlay ? "Show images separately" : "Overlay previous image"}</button>}</div>
          {!region && <p className={styles.help}>No image location was recorded for this finding. Review the full photograph.</p>}
        </> : <div className={styles.imageEmpty} role="status"><ImageOff size={32} /><h3>{loading ? "Opening the photograph" : "No linked photograph"}</h3><p>{loading ? "Loading the saved evidence for this finding." : "A source image is not available. Add or restore evidence before making a review decision."}</p></div>}
        {baseline?.url && ready ? <section className={styles.comparison} aria-label="Previous image comparison">
          {baselineError && <p role="alert">The previous image could not be displayed. Reload evidence to retry.</p>}
          {overlay ? <><h3>Align the previous image</h3><p>Manual visual comparison only. Changes in angle, lighting, or image shape can look like defects.</p><div className={styles.sliders}>
            <label>Previous image opacity<input aria-label="Previous image opacity" type="range" min="0" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
            <label>Previous image scale<input aria-label="Previous image scale" type="range" min="50" max="200" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
            <label>Horizontal alignment<input aria-label="Horizontal alignment" type="range" min="-50" max="50" value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} /></label>
            <label>Vertical alignment<input aria-label="Vertical alignment" type="range" min="-50" max="50" value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} /></label>
          </div><button type="button" onClick={() => { setOpacity(50); setScale(100); setOffsetX(0); setOffsetY(0); }}><RotateCcw size={14} /> Reset alignment</button></> : <details><summary>View previous inspection image</summary><img src={baseline.url} alt="Previous inspection evidence" className={styles.previousImage} onError={() => setBaselineError(true)} /></details>}
          {typeof selected.detector.comparisonNote === "string" && <p>{selected.detector.comparisonNote}</p>}
        </section> : ready && <p className={styles.help}>No previous image is linked to this finding.</p>}
      </section>
      <aside className={styles.reviewPanel} aria-label="Finding review and report">
        <section className={styles.decision} aria-labelledby="photo-decision-heading">
          <div className={styles.badges}><span className={styles.badge} data-tone={status.tone}>{status.label}</span><span className={styles.severity} data-urgent={selected.severity === "high" || selected.severity === "critical"}>{selected.severity} severity</span></div>
          <h3 id="photo-decision-heading">Does this need attention?</h3><p className={styles.description}>{selected.description || "No description was recorded. Check the source image before deciding."}</p>
          {ready && status.canReview ? <><div className={styles.decisionButtons}><button type="button" className={styles.confirm} disabled={Boolean(busy) || !imageReady || imageError || dirty} onClick={() => void persist("confirm")}><Check size={16} />{busy === "confirm" ? "Confirming..." : "Confirm issue"}</button><button type="button" className={styles.secondary} disabled={Boolean(busy) || !imageReady || imageError || dirty} onClick={() => void persist("dismiss")}><X size={16} />{busy === "dismiss" ? "Dismissing..." : "Dismiss"}</button></div><p className={styles.helpDark}>{dirty ? "Save your note before making a review decision." : "Confirm adds this finding to tracked issues. Dismiss marks this suggestion as not accepted."}</p></> : ready && <p className={styles.reviewed}>{status.label}</p>}
        </section>
        <section className={styles.noteSection} aria-labelledby="photo-note-heading"><h3 id="photo-note-heading">What should the client know?</h3><label htmlFor="photo-report-note">Note for report</label><textarea id="photo-report-note" aria-label="Note for report" maxLength={2000} rows={5} value={draft.note} disabled={!ready || Boolean(busy)} placeholder="Describe what you can see and the next step." onChange={(event) => { setDraft((d) => ({ ...d, note: event.target.value })); setMessage(""); }} /><div className={styles.noteMeta}><span>{dirty ? "Unsaved changes" : "No unsaved changes"}</span><span>{draft.note.length}/2000</span></div><label className={styles.include}><input type="checkbox" disabled={!ready || Boolean(busy)} checked={draft.included} onChange={(event) => { setDraft((d) => ({ ...d, included: event.target.checked })); setMessage(""); }} />Include finding and linked images in report</label><button type="button" className={styles.save} disabled={!ready || Boolean(busy)} onClick={() => void persist("note")}><Save size={16} />{busy === "note" ? "Saving..." : "Save report note"}</button></section>
        {message && <p className={styles.success} role="status">{message}</p>}{writeError && <p className={styles.error} role="alert">{writeError}</p>}
        <details className={styles.details}><summary>Source and confidence</summary><p>{confidence !== null && Number.isFinite(confidence) ? `${Math.round(confidence * 100)}% model confidence` : selected.detector?.provider === "operator" ? "Operator observation" : "Confidence not recorded"}</p><p>Sensor: {selected.sensor_mode ?? "Not recorded"}</p><p>Model confidence is not a diagnosis. Confirm only what the evidence supports.</p></details>
        <div className={styles.reportAction}>{ready && !dirty && !busy ? <a href={`/dominic/inspections/${encodeURIComponent(inspectionId)}/report`} target="_blank" rel="noopener noreferrer"><FileText size={16} />Preview inspection report<ChevronRight size={16} /></a> : <><button type="button" disabled><FileText size={16} />Preview inspection report</button>{dirty && <p>Save your note before opening the report.</p>}</>}</div>
      </aside>
    </div>
    <footer className={styles.footer}>Saved inspection evidence. Review decisions are yours; this screen does not certify equipment safety.</footer>
  </dialog>;
}
