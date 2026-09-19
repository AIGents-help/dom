"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowRight, Plus, ScanLine, Sparkles } from "lucide-react";
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

  const processing = projects.filter((p) => ["queued", "processing"].includes(p.status)).length;
  const completed = projects.filter((p) => p.status === "completed").length;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, .6fr)",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            ...panelStyle,
            minHeight: 180,
            background: "radial-gradient(circle at 84% 12%, rgba(244,90,30,.20), transparent 34%), linear-gradient(135deg, #121922, #0C1218)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: V.signal, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>
              <Sparkles size={15} /> Intelligent Mapping
            </div>
            <h2 className="font-saira" style={{ marginTop: 10, fontSize: 27, lineHeight: 1.05, color: V.ink, fontWeight: 800 }}>
              Turn flight data into answers.
            </h2>
            <p style={{ marginTop: 8, color: V.inkDim, fontSize: 13, maxWidth: 560, lineHeight: 1.55 }}>
              Upload once. DOMINIC processes, measures, analyzes, and prepares professional deliverables inside the same DOM mission workflow.
            </p>
            <button onClick={onNewProject} style={{ ...btnPrimary, marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Plus size={16} /> New DOMINIC Project
            </button>
          </div>
          <Image src="/brand/dom-propeller-3fin.png" alt="" width={116} height={116} style={{ opacity: .94, flexShrink: 0 }} />
        </div>

        <div style={{ ...panelStyle, display: "grid", alignContent: "center", gap: 12 }}>
          <Metric label="Projects" value={String(projects.length)} />
          <Metric label="Processing now" value={String(processing)} accent />
          <Metric label="Completed" value={String(completed)} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div className="font-saira" style={{ color: V.ink, fontWeight: 750, fontSize: 16 }}>Projects</div>
          <div style={{ color: V.inkFaint, fontSize: 11, marginTop: 2 }}>Mission-linked processing workspaces</div>
        </div>
        <button onClick={onNewProject} style={{ ...btnPrimary, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> New
        </button>
      </div>

      {error && <p style={{ color: V.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: V.inkDim }}>Loading DOMINIC projects…</p>}
      {!loading && projects.length === 0 && (
        <div style={{ ...panelStyle, textAlign: "center", padding: 42 }}>
          <ScanLine size={32} color={V.signal} style={{ margin: "0 auto 12px" }} />
          <p style={{ color: V.ink, fontWeight: 700 }}>No DOMINIC projects yet.</p>
          <p style={{ color: V.inkFaint, fontSize: 13, marginTop: 6 }}>Start from an accepted mission and keep the full mapping workflow inside DOM.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 9 }}>
        {projects.map((p) => (
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

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8, borderBottom: `1px solid ${V.lineSoft}` }}>
      <span style={{ color: V.inkDim, fontSize: 12 }}>{label}</span>
      <span className="font-mono-ibm" style={{ color: accent ? V.signal : V.ink, fontSize: 20, fontWeight: 800 }}>{value}</span>
    </div>
  );
}
