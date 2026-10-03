"use client";
/* eslint-disable @next/next/no-img-element -- signed private report imagery */
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { findingImageRegion, findingMediaId, type InspectionReportData } from "@/lib/dominicInspectionEvidence";

export default function DominicIllustratedInspectionReport({ inspectionId }: { inspectionId: string }) {
  const [data, setData] = useState<InspectionReportData | null>(null);
  const [error, setError] = useState("");
  const [pendingImages, setPendingImages] = useState(0);
  const [imageFailures, setImageFailures] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: session } = await getSupabaseBrowser().auth.getSession();
      if (!session.session) throw new Error("Sign in to view this private inspection report.");
      const response = await fetch(`/api/dominic/inspections/${inspectionId}/report`, { cache: "no-store", headers: { Authorization: `Bearer ${session.session.access_token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Report unavailable.");
      if (active) {
        const payload = body as InspectionReportData;
        const included = payload.findings.filter((finding) => finding.review_status !== "dismissed" && finding.detector.reportIncluded !== false);
        setPendingImages(included.reduce((count, finding) => count + Number(Boolean(payload.media.find((item) => item.id === findingMediaId(finding))?.url)) + Number(Boolean(payload.baselineMedia.find((item) => item.id === finding.detector.baselineSourceMediaId)?.url)), 0));
        setData(payload);
      }
    })().catch((error) => { if (active) setError(error instanceof Error ? error.message : "Report unavailable."); });
    return () => { active = false; };
  }, [inspectionId]);
  if (error) return <main style={{ padding: 24 }}><p role="alert">{error}</p></main>;
  if (!data) return <main style={{ padding: 24 }}>Generating illustrated report…</main>;
  const findings = data.findings.filter((finding) => finding.review_status !== "dismissed" && finding.detector.reportIncluded !== false);
  return <main style={{ background: "white", color: "#172033", minHeight: "100vh", padding: "24px clamp(16px,5vw,64px)", maxWidth: 1100, margin: "auto" }}>
    <style>{`@media print { .inspection-print-controls { display:none!important } .inspection-report-finding { break-inside:avoid } body { background:white!important } }`}</style>
    <div className="inspection-print-controls" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <button type="button" disabled={pendingImages > 0} onClick={() => window.print()} style={{ padding: "10px 16px", background: "#F45A1E", borderRadius: 8, color: "#111" }}>{pendingImages ? "Preparing images…" : "Print / Save PDF"}</button>
      <a href="/dominic">Return to workspace</a>
      {imageFailures > 0 ? <p role="alert">{imageFailures} image(s) could not load. Reload before printing to retry.</p> : null}
    </div>
    <p style={{ color: "#B84318", fontWeight: 700 }}>DOMINIC · Intelligent Inspection</p>
    <h1 style={{ fontSize: 29 }}>{data.asset.name} — inspection report</h1>
    <p>{data.inspection.inspection_type.replaceAll("_", " ")} · {data.inspection.status} · Generated {new Date(data.generatedAt).toLocaleString()}</p>
    <p>{data.inspection.objective}</p><p>{data.inspection.summary}</p>
    <p>{findings.length} included finding(s). Unconfirmed detections are candidate observations requiring inspector review.</p>
    {!findings.length ? <p>No findings selected for this report.</p> : null}
    {findings.map((finding, index) => {
      const media = data.media.find((item) => item.id === findingMediaId(finding));
      const baseline = data.baselineMedia.find((item) => item.id === finding.detector.baselineSourceMediaId);
      const region = findingImageRegion(finding);
      const imageDone = () => setPendingImages((count) => Math.max(0, count - 1));
      const imageError = () => { imageDone(); setImageFailures((count) => count + 1); };
      return <article className="inspection-report-finding" key={finding.id} style={{ borderTop: "1px solid #CBD3DC", padding: "20px 0" }}>
        <h2 style={{ fontSize: 21 }}>{index + 1}. {finding.title}</h2>
        <p><strong>{finding.severity} · {finding.review_status.replaceAll("_", " ")}</strong> · {new Date(finding.observed_at).toLocaleString()}</p>
        <p>{finding.description}</p>
        {typeof finding.detector.reportNote === "string" && finding.detector.reportNote ? <p style={{ whiteSpace: "pre-wrap" }}><strong>Inspector note: </strong>{finding.detector.reportNote}</p> : null}
        {media?.url ? <figure style={{ margin: 0 }}><div style={{ position: "relative" }}>
          <img src={media.url} alt={`Evidence for ${finding.title}`} onLoad={imageDone} onError={imageError} style={{ width: "100%", display: "block" }} />
          {region ? <div style={{ position: "absolute", left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`, border: "3px solid #E45220", boxSizing: "border-box" }} /> : null}
        </div><figcaption>Current evidence · {media.original_filename ?? media.id} · {media.captured_at ?? media.created_at}</figcaption></figure> : <p>Source image unavailable or not linked.</p>}
        {baseline?.url ? <figure style={{ margin: "16px 0" }}><img src={baseline.url} alt={`Previous evidence for ${finding.title}`} onLoad={imageDone} onError={imageError} style={{ width: "100%", display: "block" }} /><figcaption>Previous evidence · {baseline.captured_at ?? baseline.created_at}</figcaption></figure> : null}
        {typeof finding.detector.comparisonNote === "string" ? <p><strong>Comparison assessment: </strong>{finding.detector.comparisonNote}</p> : null}
        {typeof finding.detector.recommendedAction === "string" ? <p><strong>Recommended action: </strong>{finding.detector.recommendedAction}</p> : null}
      </article>;
    })}
  </main>;
}
