"use client";

import { useEffect, useState, useCallback } from "react";
import { V, panelStyle, btnPrimary, statusPillStyle } from "./theme";
import { MAPPING_PROJECT_STATUS_OPTIONS, MAPPING_PROJECT_STATUS_LABELS, formatProgress } from "@/lib/mapperPipeline";
import type { MappingProject } from "./types";

type ProjectRow = MappingProject & { job: { id: string; title: string; location: string | null } | null };

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  MAPPING_PROJECT_STATUS_OPTIONS.map((s) => [
    s.value,
    s.value === "completed" ? "#16A34A" : s.value === "failed" ? "#DC2626" : s.value === "processing" || s.value === "queued" ? "#E5701F" : "#5F6B7A",
  ])
);

export default function MappingProjectList({
  accessToken,
  onOpenProject,
  onNewProject,
}: {
  accessToken: string;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/pilot/mapping/projects", { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not load mapping projects.");
      setLoading(false);
      return;
    }
    setProjects(body.projects ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: V.inkDim, fontSize: 13 }}>
          Mapping projects turn raw drone imagery into orthomosaics, 3D models, and point clouds.
        </p>
        <button onClick={onNewProject} style={btnPrimary}>+ New Mapping Project</button>
      </div>

      {error && <p style={{ color: V.signal, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: V.inkDim }}>Loading mapping projects…</p>}
      {!loading && projects.length === 0 && (
        <div style={{ ...panelStyle, textAlign: "center", padding: 40 }}>
          <p style={{ color: V.inkDim }}>No mapping projects yet.</p>
          <p style={{ color: V.inkFaint, fontSize: 13, marginTop: 6 }}>Start one from an accepted mission to process its imagery.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenProject(p.id)}
            style={{ ...panelStyle, textAlign: "left", cursor: "pointer", width: "100%" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="font-saira" style={{ fontWeight: 600, fontSize: 16, color: V.ink }}>{p.name}</div>
                <div style={{ color: V.inkFaint, fontSize: 12, marginTop: 3 }}>
                  {p.job?.title ?? "Unlinked job"} · {p.location_snapshot ?? "Location TBD"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className="font-mono-ibm" style={statusPillStyle(STATUS_COLOR[p.status] ?? V.inkFaint)}>
                  {MAPPING_PROJECT_STATUS_LABELS[p.status] ?? p.status}
                </span>
                {(p.status === "processing" || p.status === "queued") && (
                  <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 6 }}>{formatProgress(p.processing_progress)}</div>
                )}
              </div>
            </div>
            <div className="font-mono-ibm" style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: V.inkFaint }}>
              <span>{p.image_count} images</span>
              <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
