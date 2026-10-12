"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, FileText, FolderOpen, Images, Plus, RefreshCw, Search, Settings2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import type { ProjectInspection } from "@/lib/dominicProjectRecords";
import { inspectionDisplayStatus, readableInspectionType, visibleProjectInspections } from "@/lib/dominicInspectionWorkspace.mjs";
import DominicInspectionEvidenceReview from "./DominicInspectionEvidenceReview";
import styles from "./DominicInspectionWorkspace.module.css";

type Context = {
  inspection: { id: string; asset_id: string; inspection_type: string; objective: string | null; status: string; sensor_modes: string[] };
  asset: { id: string; name: string; asset_type: string };
};
const PAGE_SIZE = 9;

export default function DominicIntelligentInspection({ projectId, accessToken, initialInspectionId, onOpenAssets, copilotMode = false }: {
  projectId: string; accessToken: string; initialInspectionId?: string | null;
  copilotMode?: boolean;
  onOpenAssets: (assetId?: string, inspectionId?: string) => void;
}) {
  const [records, setRecords] = useState<{ projectId: string; rows: ProjectInspection[] } | null>(null);
  const [selectedId, setSelectedId] = useState(initialInspectionId ?? "");
  const [context, setContext] = useState<(Context & { projectId: string }) | null>(null);
  const [listError, setListError] = useState("");
  const [contextError, setContextError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [contextReload, setContextReload] = useState(0);
  const [view, setView] = useState<"list" | "evidence">(initialInspectionId || copilotMode ? "evidence" : "list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const inspections = useMemo(() => records?.projectId === projectId ? records.rows : [], [records, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      setLoading(true); setListError("");
      const response = await fetch(`/api/pilot/mapping/projects/${projectId}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || body.recordsError) throw new Error(body.error ?? body.recordsError ?? "Your inspections could not be loaded.");
      if (!Array.isArray(body.inspections)) throw new Error("The inspection list was not returned. Please try again.");
      if (!active) return;
      const rows: ProjectInspection[] = body.inspections;
      setRecords({ projectId, rows });
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows.some((row) => row.id === initialInspectionId) ? initialInspectionId! : rows[0]?.id ?? "");
      setLoading(false);
    })().catch((failure) => {
      if (active) { setListError(failure instanceof Error ? failure.message : "Your inspections could not be loaded."); setLoading(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [projectId, accessToken, initialInspectionId, reload]);

  useEffect(() => {
    if (view !== "evidence" || !selectedId || !inspections.some((row) => row.id === selectedId)) return;
    let active = true;
    (async () => {
      setContext(null); setContextError("");
      const sb = getSupabaseBrowser();
      const { data: userResult, error: userError } = await sb.auth.getUser();
      if (userError || !userResult.user) throw new Error("Your session expired. Sign in again to open this inspection.");
      const { data: inspection, error } = await sb.from("dominic_inspections")
        .select("id,asset_id,inspection_type,objective,status,sensor_modes").eq("id", selectedId).eq("user_id", userResult.user.id).single();
      if (error) throw error;
      const assetResult = await sb.from("dominic_assets").select("id,name,asset_type")
        .eq("id", inspection.asset_id).eq("user_id", userResult.user.id).single();
      if (assetResult.error) throw assetResult.error;
      if (active) setContext({ projectId, inspection, asset: assetResult.data });
    })().catch((failure) => { if (active) setContextError(failure instanceof Error ? failure.message : "This inspection could not be opened."); });
    return () => { active = false; };
  }, [selectedId, inspections, projectId, view, contextReload]);

  const selected = inspections.find((row) => row.id === selectedId);
  const selectedContext = !loading && !listError && !contextError && selected && context?.projectId === projectId && context.inspection.id === selectedId ? context : null;
  const displayStatus = inspectionDisplayStatus(selectedContext?.inspection.status ?? selected?.status ?? "");
  const matches = useMemo(() => visibleProjectInspections(inspections, query, filter), [inspections, query, filter]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const reviewCount = inspections.filter((row) => row.status === "review").length;
  const activeCount = inspections.filter((row) => ["planned", "capturing", "analyzing"].includes(row.status)).length;
  const reportCount = inspections.filter((row) => row.status === "complete").length;
  const openEvidence = (id: string) => {
    setSelectedId(id); setContext(null); setContextError(""); setView("evidence");
    requestAnimationFrame(() => evidenceHeading.current?.focus());
  };
  const openList = () => {
    setView("list");
    requestAnimationFrame(() => listHeading.current?.focus());
  };
  const setup = (row: ProjectInspection) => onOpenAssets(row.asset_id, row.id);

  return <section className={styles.workspace} aria-label={copilotMode ? "AI Inspection Copilot" : "Intelligent Inspection"}>
    <div className={styles.topline}>
      <span className={styles.eyebrow}>PROJECT WORKSPACE / INSPECTIONS</span>
      <button type="button" className={styles.quietButton} disabled={loading} onClick={() => { setReload((n) => n + 1); setContextReload((n) => n + 1); }}><RefreshCw size={15} /> Refresh inspections</button>
    </div>
    {view === "list" ? <>
      <header className={styles.headingRow}>
        <div><h1 ref={listHeading} tabIndex={-1}>Your inspections</h1><p>Know what needs attention. Pick up where you left off.</p></div>
        <button type="button" className={styles.primaryButton} onClick={() => onOpenAssets()}><Plus size={17} /> Start an inspection</button>
      </header>
      {loading ? <div className={styles.empty} role="status"><RefreshCw size={24} /><h2>Loading your inspections</h2><p>Your saved work will appear here.</p></div> : listError ? <div className={styles.error} role="alert"><h2>We couldn&apos;t load your inspections</h2><p>{listError}</p><button type="button" className={styles.secondaryButton} onClick={() => setReload((n) => n + 1)}>Try again</button></div> : <>
        <div className={styles.summary} aria-label="Inspections in this project">
          <button type="button" onClick={() => { setFilter("review"); setPage(0); }} className={styles.summaryCard}><span className={styles.summaryIcon}><ClipboardCheck size={20} /></span><span><strong>{reviewCount}</strong><span>Need your review</span></span><ArrowRight size={16} /></button>
          <button type="button" onClick={() => { setFilter("active"); setPage(0); }} className={styles.summaryCard}><span className={styles.summaryIcon}><Images size={20} /></span><span><strong>{activeCount}</strong><span>In progress</span></span><ArrowRight size={16} /></button>
          <button type="button" onClick={() => { setFilter("complete"); setPage(0); }} className={styles.summaryCard}><span className={styles.summaryIcon}><FileText size={20} /></span><span><strong>{reportCount}</strong><span>Completed inspections</span></span><ArrowRight size={16} /></button>
        </div>
        <div className={styles.listHeader}>
          <div><h2>Inspection library</h2><p>{inspections.length} linked to this project</p></div>
          <label className={styles.search}><Search size={17} /><input aria-label="Search inspections" placeholder="Search assets or inspection purpose" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        </div>
        <div className={styles.filters} aria-label="Filter inspections">{[["all", "All inspections"], ["review", "Need review"], ["active", "In progress"], ["complete", "Completed"], ["closed", "Cancelled"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}</div>
        {rows.length ? <div className={styles.cards}>{rows.map((row) => {
          const state = inspectionDisplayStatus(row.status);
          return <article key={row.id} className={styles.inspectionCard} data-testid="inspection-card">
            <div className={styles.cardTop}><span className={styles.assetIcon}><FolderOpen size={24} /></span><span className={styles.badge} data-tone={state.tone}>{state.label}</span></div>
            <p className={styles.cardType}>{readableInspectionType(row.inspection_type)}</p>
            <h3>{row.asset_name || "Unnamed asset"}</h3><p className={styles.objective}>{row.objective || "No inspection purpose added yet."}</p>
            <div className={styles.cardAction}>
              {row.status === "complete" ? <a href={`/dominic/inspections/${encodeURIComponent(row.id)}/report`} target="_blank" rel="noopener noreferrer" aria-label={`Open report for ${row.asset_name} (new tab)`}>{state.action}<ArrowRight size={16} /></a> : <button type="button" onClick={() => row.status === "planned" ? setup(row) : openEvidence(row.id)}>{state.action}<ArrowRight size={16} /></button>}
              <button type="button" className={styles.detailsButton} onClick={() => openEvidence(row.id)} aria-label={`View details for ${row.asset_name}`}>Details</button>
            </div>
          </article>;
        })}</div> : <div className={styles.empty}><FolderOpen size={30} /><h2>{inspections.length ? "No inspections match" : "Your first inspection starts here"}</h2><p>{inspections.length ? "Try another search or show all inspections." : "Choose an asset, explain what you need to inspect, then add your photos or plan a capture."}</p><button type="button" className={styles.secondaryButton} onClick={() => inspections.length ? (setQuery(""), setFilter("all"), setPage(0)) : onOpenAssets()}>{inspections.length ? "Show all inspections" : "Choose an asset"}</button></div>}
        {matches.length > PAGE_SIZE && <nav className={styles.pager} aria-label="Inspection pages"><span>{matches.length} inspections / page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
        <div className={styles.workflowNote}><CheckCircle2 size={18} /><p><strong>Your work, in one place.</strong> Set up the inspection, collect evidence, review possible issues, then prepare the report. A saved status is not a safety approval.</p></div>
      </>}
    </> : <>
      <button type="button" className={styles.backButton} onClick={openList}><ArrowLeft size={16} /> All inspections</button>
      <header className={styles.headingRow}>
        <div><p className={styles.cardType}>{copilotMode ? "AI Inspection Copilot" : readableInspectionType(selected?.inspection_type ?? "Inspection")}</p><h1 ref={evidenceHeading} tabIndex={-1}>{selected?.asset_name || "Inspection workspace"}</h1><p>{selected?.objective || "Review the evidence before deciding what needs attention."}</p></div>
        {selected && <span className={styles.badge} data-tone={displayStatus.tone}>{displayStatus.label}</span>}
      </header>
      {!loading && !listError && selected && <div className={styles.reviewToolbar}>
        <label>Switch inspection<select aria-label="Project inspection" value={selectedId} onChange={(event) => openEvidence(event.target.value)}>{inspections.map((row) => <option key={row.id} value={row.id}>{row.asset_name} / {readableInspectionType(row.inspection_type)} / {inspectionDisplayStatus(row.status).label}</option>)}</select></label>
        <div className={styles.toolbarActions}><button type="button" className={styles.secondaryButton} disabled={!selected} aria-label="Open asset & capture setup" onClick={() => selected && setup(selected)}><Settings2 size={16} /> Capture setup</button>{selectedContext && <a className={styles.primaryButton} href={`/dominic/inspections/${encodeURIComponent(selectedId)}/report`} target="_blank" rel="noopener noreferrer"><FileText size={16} /> {selectedContext.inspection.status === "complete" ? "Open report" : "Preview report"}</a>}</div>
      </div>}
      {loading ? <p className={styles.empty} role="status">Loading inspections...</p> : listError || contextError ? <div className={styles.error} role="alert"><h2>This inspection could not be opened</h2><p>{listError || contextError}</p><button type="button" className={styles.secondaryButton} onClick={() => { setReload((n) => n + 1); setContextReload((n) => n + 1); }}>Try again</button></div> : !inspections.length ? <div className={styles.empty}><h2>No inspections linked yet</h2><button type="button" className={styles.primaryButton} onClick={() => onOpenAssets()}>Create an asset inspection</button></div> : selectedContext ? <div className={styles.evidenceCanvas}>
        <div className={styles.evidenceIntro}><Images size={18} /><span>Evidence & findings</span><span>Confirm possible issues before including them as findings.</span></div>
        <DominicInspectionEvidenceReview key={`${projectId}:${selectedId}`} inspection={selectedContext.inspection} asset={selectedContext.asset} watchIncoming copilotMode={copilotMode} onCaptureSetup={() => onOpenAssets(selectedContext.asset.id, selectedContext.inspection.id)} />
      </div> : <div className={styles.empty} role="status">Opening selected inspection...</div>}
    </>}
  </section>;
}
