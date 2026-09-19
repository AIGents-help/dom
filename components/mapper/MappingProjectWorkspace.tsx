"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ImageIcon, Layers3, UploadCloud } from "lucide-react";
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
}: {
  accessToken: string;
  projectId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pilot/mapping/projects/${projectId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Could not load this project."); setLoading(false); return; }
    setData(body);
    setLoading(false);
  }, [accessToken, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data || !["queued", "processing"].includes(data.project.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data, load]);

  if (loading) return <p style={{ color: V.inkDim }}>Opening project…</p>;
  if (error || !data) return <p style={{ color: V.danger }}>{error ?? "Project not found."}</p>;

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
          <p style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>
            {project.job?.title ?? "Unlinked mission"} · {project.location_snapshot ?? "Location TBD"}
            {project.latitude != null && project.longitude != null && ` · ${project.latitude.toFixed(5)}, ${project.longitude.toFixed(5)}`}
          </p>
        </div>
        <span className="font-mono-ibm" style={statusPillStyle(STATUS_COLOR[project.status] ?? V.inkFaint)}>
          {MAPPING_PROJECT_STATUS_LABELS[project.status] ?? project.status}
        </span>
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
          marginBottom: 16,
        }}
      >
        <Stat k="Images" v={String(project.image_count)} />
        <Stat k="Uploaded" v={formatBytes(project.total_upload_bytes)} />
        <Stat k="Outputs" v={String(deliverables.length)} />
        <Stat k="Created" v={new Date(project.created_at).toLocaleDateString()} />
      </div>

      {processed && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: V.inkFaint, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <Layers3 size={14} color={V.signal} /> Map · Measure · Analyze
          </div>
          <DominicWorkbench deliverables={deliverables} accessToken={accessToken} projectId={project.id} />
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: processed ? "minmax(0, .9fr) minmax(0, 1.1fr)" : "1fr", gap: 14, alignItems: "start" }}>
        <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.surface, padding: 15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: V.inkFaint, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <UploadCloud size={14} color={V.signal} /> Source Imagery
          </div>
          <MappingImageUploader
            accessToken={accessToken}
            projectId={project.id}
            disabled={!canUploadImages(project)}
            onUploaded={load}
          />
          {!canUploadImages(project) && (
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

        <section>
          <MappingProcessingStatus accessToken={accessToken} project={project} latestJob={latestJob} onQueued={load} />
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
