"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowRight, Plus, ScanLine } from "lucide-react";
import { V, panelStyle, btnPrimary, statusPillStyle } from "./theme";
import { MAPPING_PROJECT_STATUS_OPTIONS, MAPPING_PROJECT_STATUS_LABELS, formatProgress } from "@/lib/mapperPipeline";
import type { MappingProject } from "./types";

type ProjectRow = MappingProject & { job: { id: string; title: string; location: string | null } | null };

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  MAPPING_PROJECT_STATUS_OPTIONS.map((s) => [
    s.value,
    s.value === "completed" ? V.telemetry : s.value === "failed" ? V.danger : s.value === "processing" || s.value === "queued" ? V.signal : V.inkFaint,
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
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/pilot/mapping/projects", { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not load DOMINIC projects.");
      setLoading(false);
      return;
    }
    setProjects(body.projects ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const query = search.trim().toLowerCase();
  const visibleProjects = projects.filter((project) => !query || [project.name, project.location_snapshot, project.job?.title].some((value) => value?.toLowerCase().includes(query)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ color: V.ink, fontWeight: 700, fontSize: 24, margin: 0 }}>Projects</h1>
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 5 }}>Open a project to upload photos, process maps and models, or export results.</p>
        </div>
        <button onClick={onNewProject} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} /> New project
        </button>
      </div>
      <input aria-label="Search projects" placeholder="Search projects or locations" value={search} onChange={(event) => setSearch(event.target.value)}
        style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${V.line}`, background: V.raised, color: V.ink, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14 }} />

      {error && <p style={{ color: V.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: V.inkDim }}>Loading DOMINIC projects…</p>}
      {!loading && projects.length === 0 && (
        <div style={{ ...panelStyle, textAlign: "center", padding: 42 }}>
          <ScanLine size={32} color={V.signal} style={{ margin: "0 auto 12px" }} />
          <p style={{ color: V.ink, fontWeight: 700 }}>No DOMINIC projects yet.</p>
          <p style={{ color: V.inkFaint, fontSize: 13, marginTop: 6 }}>Create a project to upload your photos.</p>
        </div>
      )}

      {!loading && projects.length > 0 && visibleProjects.length === 0 ? <p style={{ color: V.inkDim }}>No projects match this search.</p> : null}
      <div style={{ display: "grid", gap: 9 }}>
        {visibleProjects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenProject(p.id)}
            style={{
              ...panelStyle,
              textAlign: "left",
              cursor: "pointer",
              width: "100%",
              padding: 14,
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="font-saira" style={{ fontWeight: 700, fontSize: 16, color: V.ink }}>{p.name}</div>
              <div style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>
                {p.job?.title ?? "Unlinked mission"} · {p.location_snapshot ?? "Location TBD"}
              </div>
              <div className="font-mono-ibm" style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: V.inkFaint, flexWrap: "wrap" }}>
                <span>{p.image_count} images</span>
                <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
                {(p.status === "processing" || p.status === "queued") && <span>{formatProgress(p.processing_progress)}</span>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="font-mono-ibm" style={statusPillStyle(STATUS_COLOR[p.status] ?? V.inkFaint)}>
                {MAPPING_PROJECT_STATUS_LABELS[p.status] ?? p.status}
              </span>
              <ArrowRight size={17} color={V.inkFaint} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
