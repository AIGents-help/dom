"use client";

import { useMemo, useState } from "react";
import { Download, FileArchive, FileCode2, FileDown, Layers3 } from "lucide-react";
import { deliverableHasFile } from "@/lib/mapperPipeline";
import { V, panelStyle } from "./theme";
import type { MappingDeliverable } from "./types";

const EXPORTS = [
  { type: "contours", label: "GeoJSON", description: "GIS-ready contour vectors", icon: FileCode2 },
  { type: "contours_shapefile", label: "Shapefile", description: "Zipped SHP/SHX/DBF/PRJ package", icon: FileArchive },
  { type: "contours_kml", label: "KML", description: "Google Earth / GIS exchange", icon: Layers3 },
  { type: "contours_dxf", label: "DXF", description: "CAD-ready contour lines", icon: FileDown },
] as const;

export default function DominicExportPanel({
  deliverables,
  accessToken,
  projectId,
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byType = useMemo(
    () => new Map(deliverables.filter((item) => item.type).map((item) => [item.type as string, item])),
    [deliverables]
  );

  async function download(deliverable: MappingDeliverable) {
    setBusy(deliverable.id);
    setError(null);
    try {
      const res = await fetch(`/api/pilot/mapping/projects/${projectId}/deliverables/${deliverable.id}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        setError(body.error ?? "Could not prepare this export.");
        return;
      }
      window.open(body.url, "_blank");
    } catch {
      setError("Network error while preparing the export.");
    } finally {
      setBusy(null);
    }
  }

  const hasVectorExport = EXPORTS.some((item) => byType.has(item.type));
  if (!hasVectorExport) return null;

  return (
    <section style={{ ...panelStyle, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div className="font-mono-ibm" style={{ fontSize: 10, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".08em" }}>
            GIS + CAD Export
          </div>
          <div style={{ marginTop: 3, color: V.ink, fontSize: 14, fontWeight: 750 }}>Take DOMINIC data into the tools your client already uses.</div>
        </div>
        <span style={{ color: V.inkFaint, fontSize: 10 }}>Professional exchange formats</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        {EXPORTS.map(({ type, label, description, icon: Icon }) => {
          const deliverable = byType.get(type);
          const ready = !!deliverable && deliverableHasFile(deliverable);
          return (
            <button
              key={type}
              onClick={() => deliverable && ready ? download(deliverable) : undefined}
              disabled={!ready || busy === deliverable?.id}
              style={{
                border: `1px solid ${ready ? V.line : V.lineSoft}`,
                background: ready ? "#111922" : "#0B1117",
                color: ready ? V.ink : V.inkFaint,
                borderRadius: 10,
                padding: 12,
                textAlign: "left",
                cursor: ready ? "pointer" : "default",
                opacity: ready ? 1 : 0.55,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Icon size={17} color={ready ? V.signal : V.inkFaint} />
                <span className="font-mono-ibm" style={{ fontSize: 9, color: ready ? V.telemetry : V.inkFaint }}>{ready ? "READY" : "—"}</span>
              </div>
              <div style={{ marginTop: 9, fontWeight: 800, fontSize: 13 }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4, color: V.inkFaint }}>{description}</div>
              {ready ? (
                <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: V.signal }}>
                  <Download size={12} /> {busy === deliverable?.id ? "Preparing…" : "Download"}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? <p style={{ marginTop: 10, color: V.danger, fontSize: 11 }}>{error}</p> : null}
    </section>
  );
}
