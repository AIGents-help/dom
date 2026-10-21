"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import example from "@/examples/dominic-vision-evaluation.synthetic.json";
import {
  EVALUATION_PAGE_SIZE, MAX_BROWSER_EVALUATION_BYTES, evaluationSamplePage,
  parseEvaluationThresholds, type prepareBrowserVisionEvaluation,
} from "@/lib/dominicVisionEvaluationBrowser.mjs";

type Prepared = Awaited<ReturnType<typeof prepareBrowserVisionEvaluation>>;
type Result = { report: Prepared["report"]; downloadUrl: string };
type WorkerReply = { ok: true; result: Prepared } | { ok: false; error: string };
const button = "rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-40";
const panel = "rounded-xl border border-slate-300 bg-white p-5";
const input = "mt-1 w-full min-w-0 rounded-lg border border-slate-400 bg-white p-2 text-slate-900";
const percent = (value: number | null) => value === null ? "Not defined" : `${(value * 100).toFixed(1)}%`;

export default function DominicAccuracyLab() {
  const [file, setFile] = useState<File | null>(null);
  const [confidence, setConfidence] = useState("0.5");
  const [overlap, setOverlap] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Choose a labeled dataset, or load the synthetic example.");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [typePage, setTypePage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (deadlineRef.current !== null) clearTimeout(deadlineRef.current);
    deadlineRef.current = null;
  }, []);
  const discardDownload = useCallback(() => {
    if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    downloadRef.current = null;
  }, []);
  useEffect(() => () => { stop(); discardDownload(); }, [stop, discardDownload]);

  function invalidate(message: string) {
    stop(); discardDownload(); setBusy(false); setResult(null); setError(null);
    setPage(0); setTypePage(0); setNotice(message);
  }
  function selectFile(next: File | null) {
    invalidate("Dataset changed. Run evaluation to calculate its scores.");
    setFile(next); setQuery(""); setErrorsOnly(false);
    if (next && (next.size === 0 || next.size > MAX_BROWSER_EVALUATION_BYTES)) {
      setError("Choose a nonempty dataset JSON file no larger than 16 MiB.");
    }
  }
  function run() {
    invalidate("Scoring locally. You may cancel this run.");
    if (!file) { setError("Choose a labeled dataset first."); return; }
    try {
      const options = parseEvaluationThresholds(confidence, overlap);
      if (file.size === 0 || file.size > MAX_BROWSER_EVALUATION_BYTES) throw new Error("Choose a nonempty dataset JSON file no larger than 16 MiB.");
      if (typeof Worker === "undefined") throw new Error("This browser does not support background evaluation workers. Use a supported browser or the offline command-line tool.");
      const worker = new Worker(new URL("./evaluation.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setBusy(true);
      const fail = (message: string) => {
        if (workerRef.current !== worker) return;
        stop(); setBusy(false); setError(message); setNotice("No scored report is available for this run.");
      };
      worker.onerror = (event) => { event.preventDefault(); fail("The evaluation worker could not run. Retry or use the offline command-line tool."); };
      worker.onmessageerror = () => fail("The evaluation result could not be read. No report was accepted.");
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        if (workerRef.current !== worker) return;
        if (!event.data.ok) { fail(event.data.error); return; }
        try {
          const downloadUrl = URL.createObjectURL(new Blob([event.data.result.reportJson], { type: "application/json" }));
          downloadRef.current = downloadUrl;
          stop(); setBusy(false); setResult({ report: event.data.result.report, downloadUrl });
          setNotice("Evaluation complete. Scores use the thresholds shown in this report.");
        } catch { fail("The report could not be prepared for download."); }
      };
      deadlineRef.current = setTimeout(() => fail("Evaluation exceeded the 30-second limit and was stopped. Use a smaller documented partition or the offline tool."), 30_000);
      worker.postMessage({ file, options });
    } catch (failure) {
      stop(); setBusy(false); setError(failure instanceof Error ? failure.message : "Evaluation could not start.");
      setNotice("No scored report is available for this run.");
    }
  }

  const report = result?.report;
  const samplePage = useMemo(() => report ? evaluationSamplePage(report, query, errorsOnly, page) : null, [report, query, errorsOnly, page]);
  const typePages = report ? Math.max(1, Math.ceil(report.per_type.length / EVALUATION_PAGE_SIZE)) : 1;

  return <main style={{ minHeight: "100vh", background: "#E8EAEC", color: "#18212B" }}>
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" style={{ background: "#171D24", color: "#F5F7FA" }}>
      <DominicBrandLockup size="sm" />
      <Link href="/dominic" className="rounded-lg border border-slate-500 px-4 py-2 text-sm" style={{ color: "#F5F7FA" }}>Back to DOMINIC</Link>
    </header>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Recorded-image evaluation</p>
        <h1 className="mt-2 text-3xl font-bold" style={{ color: "#18212B" }}>DOMINIC Accuracy Lab</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">Compare saved candidate detections with complete human annotations. This tool scores a JSON dataset; it does not inspect raw photos, run AI, or control an aircraft.</p>
      </div>
      <section className={panel} aria-labelledby="evaluation-input-heading">
        <h2 id="evaluation-input-heading" className="text-lg font-bold" style={{ color: "#18212B" }}>1. Choose recorded evidence</h2>
        <p className="mt-2 text-sm text-slate-700">The dataset is processed on this device, not uploaded. No account records are read or changed. Export before leaving; results are not saved to your account.</p>
        <label className="mt-4 block text-sm font-semibold">Labeled dataset JSON (maximum 16 MiB)
          <input ref={fileInput} type="file" accept=".json,application/json" className={input} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={button} type="button" onClick={() => {
            if (fileInput.current) fileInput.current.value = "";
            selectFile(new File([JSON.stringify(example)], "dominic-synthetic-example.json", { type: "application/json" }));
          }}>Load synthetic example</button>
          <span className="min-w-0 break-all text-sm text-slate-600">{file ? `Selected: ${file.name}` : "No dataset selected"}</span>
        </div>
        <details className="mt-4 text-sm text-slate-700">
          <summary className="cursor-pointer font-semibold">Dataset requirements and limits</summary>
          <p className="mt-2 leading-6">Use schema version 1 with dataset and run provenance, and a samples array. Every image needs an ID, capture_group, media_sha256, annotation_complete: true, ground_truth annotations, and completed screening candidates. Regions are normalized x, y, width, height. Empty annotations mean the image was completely reviewed and is clean, not unlabeled.</p>
          <p className="mt-2 leading-6">Maximum: 10,000 images, 100 annotations and 100 candidates per image, 100,000 combined items and 5,000,000 matching pairs. Invalid or excessive input is rejected, never silently truncated. The repository guide is docs/dominic-vision-evaluation.md.</p>
        </details>
      </section>
      <section className={panel} aria-labelledby="evaluation-threshold-heading">
        <h2 id="evaluation-threshold-heading" className="text-lg font-bold" style={{ color: "#18212B" }}>2. Set scoring thresholds</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Minimum confidence (0 to 1)
            <input className={input} inputMode="decimal" value={confidence} onChange={(event) => { invalidate("Thresholds changed. Run evaluation again."); setConfidence(event.target.value); }} />
          </label>
          <label className="block text-sm font-semibold">Minimum overlap / IoU (above 0 to 1)
            <input className={input} inputMode="decimal" value={overlap} onChange={(event) => { invalidate("Thresholds changed. Run evaluation again."); setOverlap(event.target.value); }} />
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-700">Matches must share an image and finding type. Each annotation can match only once. Tune on development data; freeze thresholds before evaluating held-out data.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} style={{ background: "#F45A1E", color: "#160A02", borderColor: "#D9480F" }} disabled={busy || !file} onClick={run}>Run evaluation</button>
          {busy && <button type="button" className={button} onClick={() => invalidate("Evaluation cancelled. No result retained.")}>Cancel evaluation</button>}
          <button type="button" className={button} onClick={() => { invalidate("Dataset and report cleared."); setFile(null); setQuery(""); setErrorsOnly(false); if (fileInput.current) fileInput.current.value = ""; }}>Clear dataset and report</button>
        </div>
        <p role="status" className="mt-3 text-sm text-slate-700">{notice}</p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      </section>
      {report && result && <section aria-labelledby="evaluation-results-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="evaluation-results-heading" className="text-xl font-bold" style={{ color: "#18212B" }}>3. Evaluation results</h2>
          <a href={result.downloadUrl} download="dominic-accuracy-report.json" className={button}>Export scored JSON</a>
        </div>
        <div role="note" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>{report.dataset.source === "synthetic" ? "SYNTHETIC DATA - NOT INDUSTRIAL ACCURACY" : "FIELD DATA - SUPPLIED LABELS, NOT INDEPENDENTLY VALIDATED"}</strong>
          <p className="mt-1">These are localization scores, not a safety certificate or release approval. An unmatched or unlocalized candidate is not automatically a false visible condition.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Localization precision" value={percent(report.metrics.precision)} detail="Matched / evaluated predictions" />
          <Metric label="Localization recall" value={percent(report.metrics.recall)} detail="Matched / annotated conditions" />
          <Metric label="Localization F1" value={percent(report.metrics.f1)} detail="Balance of precision and recall" />
        </div>
        <div className={panel}>
          <p className="text-sm leading-7">{report.image_count} images across {report.capture_group_count} capture groups. Matched: <strong>{report.metrics.true_positives}</strong>. Unmatched predictions: <strong>{report.metrics.false_positives}</strong>. Missed annotations: <strong>{report.metrics.false_negatives}</strong>.</p>
          <p className="mt-2 text-sm leading-6">Clean-image false-alarm rate: <strong>{percent(report.clean_images.false_alarm_image_rate)}</strong> ({report.clean_images.with_predictions} of {report.clean_images.count} clean images). Unlocalized candidates: {report.unlocalized_prediction_count}. Below-threshold candidates: {report.excluded_prediction_count}.</p>
          <p className="mt-2 text-sm text-slate-700">Scored confidence: {report.thresholds.confidence}; overlap: {report.thresholds.iou}. Zero-denominator metrics are not defined, not 100%.</p>
          <details className="mt-4 break-words text-sm">
            <summary className="cursor-pointer font-semibold">Dataset provenance and input fingerprint</summary>
            <p className="mt-2">Dataset: {report.dataset.id}; revision: {report.dataset.revision}; split: {report.dataset.split}; labeler: {report.dataset.labeler}.</p>
            <p className="mt-2">Run: {report.run.id}; recorded model: {report.run.model}; prompt: {report.run.prompt_revision}.</p>
            <p className="mt-2 break-all">Input SHA-256: {report.input_sha256}</p>
          </details>
        </div>
        <div className={panel}>
          <h3 className="font-bold" style={{ color: "#18212B" }}>Results by finding type</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {report.per_type.slice(typePage * EVALUATION_PAGE_SIZE, (typePage + 1) * EVALUATION_PAGE_SIZE).map((row) => <article key={row.finding_type} className="min-w-0 rounded-lg border border-slate-300 p-3 text-sm">
              <strong className="break-all">{row.finding_type}</strong>
              <p className="mt-1">Matched {row.true_positives}; unmatched {row.false_positives}; missed {row.false_negatives}.</p>
              <p className="mt-1">Precision {percent(row.precision)}; recall {percent(row.recall)}.</p>
            </article>)}
          </div>
          {!report.per_type.length && <p className="mt-2 text-sm">No annotations or above-threshold candidates.</p>}
          <Pager name="finding types" page={typePage} pages={typePages} onPage={setTypePage} />
        </div>
        {samplePage && <div className={panel}>
          <h3 className="font-bold" style={{ color: "#18212B" }}>Per-image error review</h3>
          <label className="mt-3 block text-sm font-semibold">Search image or capture group
            <input className={input} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={(event) => { setErrorsOnly(event.target.checked); setPage(0); }} /> Only images with unmatched predictions or missed annotations</label>
          <p className="mt-3 text-sm">{samplePage.total} matching images; at most 12 shown per page.</p>
          <div className="mt-3 grid gap-3">
            {samplePage.rows.map((sample) => <article key={sample.id} data-testid="evaluation-sample" className="min-w-0 rounded-lg border border-slate-300 p-3 text-sm">
              <strong className="break-all">{sample.id}</strong><p className="break-all text-slate-600">{sample.capture_group}</p>
              <p className="mt-2">Matched {sample.matches.length}; unmatched {sample.false_positives.length}; missed {sample.missed_ground_truth_ids.length}; evaluated {sample.evaluated_prediction_count} of {sample.prediction_count} candidates.</p>
              {sample.missed_ground_truth_ids.length > 0 && <p className="mt-2 break-words"><strong>Missed label IDs:</strong> {sample.missed_ground_truth_ids.join(", ")}</p>}
              {sample.false_positives.length > 0 && <p className="mt-2 break-words"><strong>Unmatched candidate indexes (zero-based):</strong> {sample.false_positives.map((item) => `${item.prediction_index}: ${item.reason.replaceAll("_", " ")}`).join("; ")}</p>}
            </article>)}
          </div>
          <Pager name="images" page={samplePage.page} pages={samplePage.pageCount} onPage={setPage} />
        </div>}
        <div className={panel}><h3 className="font-bold" style={{ color: "#18212B" }}>Interpretation limits</h3>{report.limitations.map((line) => <p key={line} className="mt-2 text-sm leading-6 text-slate-700">{line}</p>)}</div>
      </section>}
    </div>
  </main>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className={panel} aria-label={label}><h3 className="text-sm font-semibold" style={{ color: "#18212B" }}>{label}</h3><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-600">{detail}</p></article>;
}
function Pager({ name, page, pages, onPage }: { name: string; page: number; pages: number; onPage: (page: number) => void }) {
  return <nav aria-label={`${name} pages`} className="mt-4 flex flex-wrap items-center gap-2">
    <button type="button" className={button} disabled={page === 0} onClick={() => onPage(0)}>First {name}</button>
    <button type="button" className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous {name}</button>
    <span className="text-sm">Page {page + 1} of {pages}</span>
    <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next {name}</button>
    <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => onPage(pages - 1)}>Last {name}</button>
  </nav>;
}
