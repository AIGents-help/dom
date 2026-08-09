"use client";

import { useCallback, useEffect, useState } from "react";
import { V, panelStyle, btnGhost, statusPillStyle } from "./theme";
import { MAPPING_PROJECT_STATUS_LABELS, formatBytes, canUploadImages } from "@/lib/mapperPipeline";
import MappingImageUploader from "./MappingImageUploader";
import MappingProcessingStatus from "./MappingProcessingStatus";
import MappingResults from "./MappingResults";
import type { MappingProject, MappingImage, MappingProcessingJob, MappingDeliverable } from "./types";

interface WorkspacePayload {
  project: MappingProject & { job: { id: string; title: string; location: string | null; status: string } | null };
  images: MappingImage[];
  processingJobs: MappingProcessingJob[];
  deliverables: MappingDeliverable[];
}

const STATUS_COLOR: Record<string, string> = {
  draft: "#5F6B7A", uploading: "#16A34A", uploaded: "#16A34A", queued: "#E5701F",
  processing: "#E5701F", completed: "#16A34A", failed: "#DC2626", cancelled: "#5F6B7A",
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

  // Poll while a processing job is actually in flight, so progress/stage
  // updates the worker writes show up without a manual refresh.
  useEffect(() => {
    if (!data || !["queued", "processing"].includes(data.project.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data, load]);

  if (loading) return <p style={{ color: V.inkDim }}>Loading project…</p>;
  if (error || !data) return <p style={{ color: V.signal }}>{error ?? "Project not found."}</p>;

  const { project, images, processingJobs, deliverables } = data;
  const latestJob = processingJobs[0] ?? null;

  return (
    <div>
      <button onClick={onBack} style={{ ...btnGhost, marginBottom: 16, padding: "6px 12px", fontSize: 12 }}>← All Projects</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div className="font-saira" style={{ fontWeight: 700, fontSize: 22, color: V.ink }}>{project.name}</div>
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 4 }}>
            {project.job?.title ?? "Unlinked job"} · {project.location_snapshot ?? "Location TBD"}
            {project.latitude != null && project.longitude != null && ` · ${project.latitude.toFixed(5)}, ${project.longitude.toFixed(5)}`}
          </p>
        </div>
        <span className="font-mono-ibm" style={statusPillStyle(STATUS_COLOR[project.status] ?? V.inkFaint)}>
          {MAPPING_PROJECT_STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <Stat k="Images" v={String(project.image_count)} />
        <Stat k="Uploaded" v={formatBytes(project.total_upload_bytes)} />
        <Stat k="Created" v={new Date(project.created_at).toLocaleDateString()} />
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        <section>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10 }}>
            Raw Imagery
          </div>
          <MappingImageUploader
            accessToken={accessToken}
            projectId={project.id}
            disabled={!canUploadImages(project)}
            onUploaded={load}
          />
          {!canUploadImages(project) && (
            <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 8 }}>
              Uploads are closed once a project is queued for processing.
            </p>
          )}
          {images.length > 0 && (
            <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 10 }}>
              {images.length} image{images.length === 1 ? "" : "s"} recorded ·{" "}
              {images.filter((i) => i.camera_make || i.captured_at).length} with worker-verified camera/GPS metadata so far
            </p>
          )}
        </section>

        <section>
          <MappingProcessingStatus accessToken={accessToken} project={project} latestJob={latestJob} onQueued={load} />
        </section>

        <section>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10 }}>
            Results
          </div>
          <MappingResults deliverables={deliverables} />
          <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 12 }}>
            Publishing to the customer happens through DOM's existing QC and delivery workflow — outputs appear here as soon as
            admin marks them QC-passed.
          </p>
        </section>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: V.raised, padding: "12px 14px" }}>
      <div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".1em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div>
      <div className="font-mono-ibm" style={{ fontSize: 16, color: V.ink, marginTop: 2, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
