"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ImageIcon, Layers3, UploadCloud, CalendarDays, MapPin, Plane, CheckCircle2, RefreshCw } from "lucide-react";
import { V, btnGhost, statusPillStyle } from "./theme";
import { MAPPING_PROJECT_STATUS_LABELS, formatBytes, canUploadImages } from "@/lib/mapperPipeline";
import MappingImageUploader from "./MappingImageUploader";
import MappingProcessingStatus from "./MappingProcessingStatus";
import MappingResults from "./MappingResults";
import DominicWorkbench from "./DominicWorkbench";
import type { MappingProject, MappingImage, MappingProcessingJob, MappingDeliverable } from "./types";

interface WorkspacePayload {
  project: MappingProject & { job: { id: string; title: string; location: string | null; status: string } | null };
  images: MappingImage[];
  processingJobs: MappingProcessingJob[];
  deliverables: MappingDeliverable[];
}

const STATUS_COLOR: Record<string, string> = {
  draft: V.inkFaint,
  uploading: V.telemetry,
  uploaded: V.telemetry,
  queued: V.signal,
  processing: V.signal,
  completed: V.telemetry,
  failed: V.danger,
  cancelled: V.inkFaint,
};

export default function MappingProjectWorkspace({
  accessToken,
  projectId,
  onBack,
  focusModule,
  online = true,
}: {
  accessToken: string;
  projectId: string;
  onBack: () => void;
  focusModule?: string | null;
  online?: boolean;
}) {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const dataRef = useRef<WorkspacePayload | null>(null);
  const cacheKey = `dominic:project-snapshot:${projectId}`;

  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async () => {
    if (!online) {
      if (!dataRef.current) {
        setError("DOMINIC is offline. Reconnect to load this project.");
        setLoading(false);
      }
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch(`/api/pilot/mapping/projects/${projectId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Could not load this project."); setLoading(false); return; }
      setError(null);
      setData(body);
      setLastSyncedAt(new Date());
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ saved_at: new Date().toISOString(), payload: body }));
      } catch {
        // Field snapshot caching is best-effort; live project loading still succeeds.
      }
      setLoading(false);
    } catch {
      if (!dataRef.current) setError("Could not reach DOMINIC. Check connectivity and retry.");
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, [accessToken, projectId, online, cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!focusModule) return;
    const targetMap: Record<string, string> = {
      "Map Viewer": "dominic-workbench",
      "Measure & Markup": "dominic-workbench",
      "Analysis": "dominic-workbench",
      "3D & Point Cloud": "dominic-workbench",
      "Deliverables": "dominic-workbench",
      "Processing": "dominic-processing",
      "Data Library": "dominic-source-imagery",
    };
    const id = targetMap[focusModule];
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focusModule]);

  useEffect(() => {
    if (!online || !data || !["queued", "processing"].includes(data.project.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data, load, online]);

  function restoreFieldSnapshot() {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) { setError("No saved field snapshot is available for this project yet."); return; }
      const cached = JSON.parse(raw) as { saved_at?: string; payload?: WorkspacePayload };
      if (!cached.payload) { setError("The saved field snapshot is not valid."); return; }
      setData(cached.payload);
      dataRef.current = cached.payload;
      setLastSyncedAt(cached.saved_at ? new Date(cached.saved_at) : null);
      setError(null);
      setLoading(false);
    } catch {
      setError("The saved field snapshot could not be opened.");
    }
  }

  if (loading) return <p style={{ color: V.inkDim }}>Opening project…</p>;
  if (error || !data) return (
    <div style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.surface, padding: 18 }}>
      <p style={{ color: V.danger, fontSize: 13 }}>{error ?? "Project not found."}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={load} disabled={!online || refreshing} style={{ ...btnGhost, opacity: !online ? .5 : 1 }}>
          <RefreshCw size={13} /> Retry live project
        </button>
        {!online ? (
          <button type="button" onClick={restoreFieldSnapshot} style={btnGhost}>
            Open saved field snapshot
          </button>
        ) : null}
      </div>
      {!online ? <p style={{ color: V.inkFaint, fontSize: 10, marginTop: 9 }}>DOMINIC saves the most recent successful project sync in this browser session for read-only field reference.</p> : null}
    </div>
  );

  const { project, images, processingJobs, deliverables } = data;
  const latestJob = processingJobs[0] ?? null;
  const processed = deliverables.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <button onClick={onBack} style={{ ...btnGhost, marginBottom: 10, padding: "6px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronLeft size={14} /> Projects
          </button>
          <div className="font-saira" style={{ fontWeight: 800, fontSize: 23, color: V.ink }}>{project.name}</div>
          <p style={{ color: V.inkDim, fontSize: 12, marginTop: 3, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Plane size={12} /> {project.job?.title ?? "Unlinked mission"}</span>
            <span>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {project.location_snapshot ?? "Location TBD"}</span>
            {project.latitude != null && project.longitude != null && <span>· {project.latitude.toFixed(5)}, {project.longitude.toFixed(5)}</span>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ color: online ? V.telemetry : V.warn, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {online ? lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Connecting" : lastSyncedAt ? `Offline · last sync ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Offline"}
          </span>
          <button
            type="button"
            onClick={load}
            disabled={!online || refreshing}
            title={!online ? "Reconnect to refresh project data" : "Refresh project data"}
            aria-label="Refresh DOMINIC project data"
            style={{ ...btnGhost, padding: "5px 7px", opacity: !online ? .45 : 1, cursor: !online ? "not-allowed" : "pointer", display: "inline-grid", placeItems: "center" }}
          >
            <RefreshCw size={13} style={{ transform: refreshing ? "rotate(90deg)" : "none", transition: "transform .2s ease" }} />
          </button>
          <span style={{ color: V.inkFaint, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={13} /> {new Date(project.created_at).toLocaleDateString()}</span>
          <span className="font-mono-ibm" style={{ ...statusPillStyle(STATUS_COLOR[project.status] ?? V.inkFaint), display: "inline-flex", alignItems: "center", gap: 5 }}>
            {project.status === "completed" && <CheckCircle2 size={11} />}
            {MAPPING_PROJECT_STATUS_LABELS[project.status] ?? project.status}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
          gap: 1,
          background: V.lineSoft,
          border: `1px solid ${V.line}`,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <Stat k="Images" v={String(project.image_count)} />
        <Stat k="Uploaded" v={formatBytes(project.total_upload_bytes)} />
        <Stat k="Deliverables" v={String(deliverables.length)} />
        <Stat k="Processing" v={latestJob?.status ? (MAPPING_PROJECT_STATUS_LABELS[latestJob.status] ?? latestJob.status) : "Ready"} />
      </div>

      {processed && (
        <section id="dominic-workbench" style={{ marginBottom: 16, scrollMarginTop: 96 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: V.inkFaint, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <Layers3 size={14} color={V.signal} /> Map · Measure · Analyze
          </div>
          <DominicWorkbench deliverables={deliverables} accessToken={accessToken} projectId={project.id} />
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: processed ? "minmax(0, .78fr) minmax(0, 1.22fr)" : "1fr", gap: 14, alignItems: "start" }}>
        <section id="dominic-source-imagery" style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.surface, padding: 15, scrollMarginTop: 96 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: V.inkFaint, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <UploadCloud size={14} color={V.signal} /> Source Imagery
          </div>
          <MappingImageUploader
            accessToken={accessToken}
            projectId={project.id}
            disabled={!online || !canUploadImages(project)}
            online={online}
            onUploaded={load}
          />
          {!online ? (
            <p style={{ color: V.warn, fontSize: 11, marginTop: 8 }}>Offline — imagery upload will be available when connectivity returns.</p>
          ) : !canUploadImages(project) && (
            <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 8 }}>
              Uploads close once processing is queued.
            </p>
          )}
          {images.length > 0 && (
            <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <ImageIcon size={13} />
              {images.length} image{images.length === 1 ? "" : "s"} · {images.filter((i) => i.camera_make || i.captured_at).length} with verified metadata
            </p>
          )}
        </section>

        <section id="dominic-processing" style={{ scrollMarginTop: 96 }}>
          <MappingProcessingStatus accessToken={accessToken} project={project} latestJob={latestJob} onQueued={load} online={online} />
        </section>
      </div>

      {!processed && (
        <section style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: V.inkFaint, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <Layers3 size={14} color={V.signal} /> Results
          </div>
          <MappingResults deliverables={deliverables} accessToken={accessToken} projectId={project.id} />
        </section>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: V.raised, padding: "11px 13px" }}>
      <div className="font-mono-ibm" style={{ fontSize: 9, letterSpacing: ".1em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div>
      <div className="font-mono-ibm" style={{ fontSize: 15, color: V.ink, marginTop: 2, fontWeight: 700 }}>{v}</div>
    </div>
  );
}
