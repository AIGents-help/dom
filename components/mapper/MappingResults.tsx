"use client";

import { useEffect, useMemo, useState } from "react";
import { dedupeDeliverables } from "@/lib/mapperPipeline";
import { V, btnGhost } from "./theme";
import OrthomosaicViewer from "./OrthomosaicViewer";
import Model3DViewer from "./Model3DViewer";
import PointCloudViewer from "./PointCloudViewer";
import ElevationRasterViewer from "./ElevationRasterViewer";
import ContourViewer from "./ContourViewer";
import DominicExportPanel from "./DominicExportPanel";
import DominicDeliverySummary from "./DominicDeliverySummary";
import MappingDeliverables from "./MappingDeliverables";
import type { MappingDeliverable } from "./types";
import type { DominicWorkbenchTool } from "./workbenchTypes";

type ViewerLayer = "orthomosaic" | "dsm" | "dtm" | "contours" | "3d_model" | "point_cloud";

const LAYER_LABELS: Record<ViewerLayer, string> = {
  orthomosaic: "Orthomosaic",
  dsm: "DSM",
  dtm: "DTM",
  contours: "Contours",
  "3d_model": "3D Model",
  point_cloud: "Point Cloud",
};

export default function MappingResults({
  deliverables,
  accessToken,
  projectId,
  workbenchTool = "select",
  toolSet = "General",
  requestedLayer,
  viewerMode = "map",
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
  workbenchTool?: DominicWorkbenchTool;
  toolSet?: string;
  requestedLayer?: string | null;
  viewerMode?: "map" | "3d" | "elevation" | "compare";
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<ViewerLayer>("orthomosaic");
  const [compareLayer, setCompareLayer] = useState<ViewerLayer>("dsm");

  const deduped = useMemo(() => dedupeDeliverables(deliverables), [deliverables]);
  const byType = useMemo(() => new Map(deduped.filter((d) => d.type).map((d) => [d.type as string, d])), [deduped]);
  const availableLayers = useMemo(
    () => (["orthomosaic", "dsm", "dtm", "contours", "3d_model", "point_cloud"] as ViewerLayer[]).filter((type) => byType.has(type)),
    [byType]
  );

  useEffect(() => {
    if (requestedLayer && availableLayers.includes(requestedLayer as ViewerLayer)) {
      setSelectedLayer(requestedLayer as ViewerLayer);
      return;
    }
    if (!availableLayers.includes(selectedLayer) && availableLayers.length > 0) setSelectedLayer(availableLayers[0]);
  }, [requestedLayer, availableLayers, selectedLayer]);

  useEffect(() => {
    const targets = availableLayers
      .map((type) => byType.get(type))
      .filter((d): d is MappingDeliverable => !!d && (!!d.storage_url || !!d.external_file_id));
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      setPreviewError(null);
      const failures: string[] = [];
      const entries = await Promise.all(
        targets.map(async (d) => {
          try {
            const res = await fetch(`/api/pilot/mapping/projects/${projectId}/deliverables/${d.id}/download`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.url) {
              failures.push(`${d.name}: ${body.error ?? "could not generate a link"}`);
              return [d.id, ""] as const;
            }
            return [d.id, body.url as string] as const;
          } catch {
            failures.push(`${d.name}: network error`);
            return [d.id, ""] as const;
          }
        })
      );
      if (cancelled) return;
      setSignedUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      if (failures.length > 0) setPreviewError(failures.join(" · "));
    })();
    return () => { cancelled = true; };
  }, [availableLayers, byType, projectId, accessToken]);

  const active = byType.get(selectedLayer) ?? null;
  const compareActive = byType.get(compareLayer) ?? null;


  function renderViewer(layer: ViewerLayer, item: MappingDeliverable | null) {
    if (!item) return <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: V.inkFaint, border: `1px solid ${V.line}`, borderRadius: 10 }}>Layer unavailable</div>;
    if (layer === "orthomosaic") return <OrthomosaicViewer signedUrl={signedUrls[item.id] ?? null} name={item.name} projectId={projectId} deliverableId={item.id} accessToken={accessToken} workbenchTool={workbenchTool} toolSet={toolSet} />;
    if (layer === "dsm" || layer === "dtm") return <ElevationRasterViewer signedUrl={signedUrls[item.id] ?? null} name={item.name} label={layer === "dsm" ? "DSM" : "DTM"} />;
    if (layer === "contours") return <ContourViewer signedUrl={signedUrls[item.id] ?? null} name={item.name} />;
    if (layer === "3d_model") return <Model3DViewer signedUrl={signedUrls[item.id] ?? null} name={item.name} />;
    return <PointCloudViewer signedUrl={signedUrls[item.id] ?? null} name={item.name} projectId={projectId} deliverableId={item.id} accessToken={accessToken} hasPotree={!!item.potree} />;
  }

  return (
    <div>
      {availableLayers.length === 0 ? (
        <p style={{ color: V.inkFaint, fontSize: 13, marginBottom: 16 }}>
          No processed outputs yet — they&apos;ll appear here once DOMINIC finishes processing this mission.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
            {availableLayers.map((layer) => (
              <button
                key={layer}
                onClick={() => setSelectedLayer(layer)}
                style={{
                  ...btnGhost,
                  padding: "6px 10px",
                  fontSize: 10,
                  borderColor: selectedLayer === layer ? V.signal : V.line,
                  color: selectedLayer === layer ? V.signal : V.inkDim,
                  background: selectedLayer === layer ? "rgba(244,90,30,.10)" : "#0D1319",
                }}
              >
                {LAYER_LABELS[layer]}
              </button>
            ))}
          </div>

          {viewerMode === "compare" && availableLayers.length >= 2 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <select
                  value={compareLayer}
                  onChange={(event) => setCompareLayer(event.target.value as ViewerLayer)}
                  style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.ink, borderRadius: 8, padding: "6px 9px", fontSize: 10 }}
                  aria-label="Comparison layer"
                >
                  {availableLayers.filter((layer) => layer !== selectedLayer).map((layer) => (
                    <option key={layer} value={layer}>{LAYER_LABELS[layer]}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                <ViewerFrame label={LAYER_LABELS[selectedLayer]}>
                  {renderViewer(selectedLayer, active)}
                </ViewerFrame>
                <ViewerFrame label={LAYER_LABELS[compareLayer]}>
                  {renderViewer(compareLayer, compareActive)}
                </ViewerFrame>
              </div>
            </div>
          ) : (
            <div style={{ position: "relative", marginBottom: 12 }}>
              {active ? <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 30, pointerEvents: "none", border: `1px solid ${V.signal}`, borderRadius: 6, padding: "4px 7px", background: "rgba(9,13,17,.78)", color: V.signal, fontSize: 8, fontWeight: 900, letterSpacing: ".12em" }}>DOMINIC PREVIEW · DRONE OPERATION MANAGEMENT</div> : null}
              {renderViewer(selectedLayer, active)}
            </div>
          )}
        </>
      )}

      {previewError && <p style={{ color: V.danger, fontSize: 12, marginBottom: 20 }}>{previewError}</p>}

      <DominicDeliverySummary deliverables={deduped} projectId={projectId} />
      <DominicExportPanel deliverables={deduped} accessToken={accessToken} projectId={projectId} />

      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10, marginTop: availableLayers.length > 0 ? 0 : 8 }}>
        All outputs
      </div>
      <MappingDeliverables deliverables={deduped} accessToken={accessToken} projectId={projectId} />
    </div>
  );
}


function ViewerFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0, border: `1px solid ${V.line}`, borderRadius: 10, overflow: "hidden", background: "#080C10" }}>
      <div style={{ padding: "7px 9px", borderBottom: `1px solid ${V.line}`, color: V.inkDim, fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
