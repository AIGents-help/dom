"use client";

import { useEffect, useMemo, useState } from "react";
import { dedupeDeliverables } from "@/lib/mapperPipeline";
import { V, btnGhost } from "./theme";
import OrthomosaicViewer from "./OrthomosaicViewer";
import Model3DViewer from "./Model3DViewer";
import PointCloudViewer from "./PointCloudViewer";
import MappingDeliverables from "./MappingDeliverables";
import type { MappingDeliverable } from "./types";
import type { DominicWorkbenchTool } from "./workbenchTypes";

type ViewerLayer = "orthomosaic" | "dsm" | "dtm" | "3d_model" | "point_cloud";

const LAYER_LABELS: Record<ViewerLayer, string> = {
  orthomosaic: "Orthomosaic",
  dsm: "DSM",
  dtm: "DTM",
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
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
  workbenchTool?: DominicWorkbenchTool;
  toolSet?: string;
  requestedLayer?: string | null;
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<ViewerLayer>("orthomosaic");

  const deduped = useMemo(() => dedupeDeliverables(deliverables), [deliverables]);
  const byType = useMemo(() => new Map(deduped.filter((d) => d.type).map((d) => [d.type as string, d])), [deduped]);
  const availableLayers = useMemo(
    () => (["orthomosaic", "dsm", "dtm", "3d_model", "point_cloud"] as ViewerLayer[]).filter((type) => byType.has(type)),
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
  const isRaster = selectedLayer === "orthomosaic" || selectedLayer === "dsm" || selectedLayer === "dtm";

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

          <div style={{ marginBottom: 12 }}>
            {active && isRaster ? (
              <OrthomosaicViewer
                signedUrl={signedUrls[active.id] ?? null}
                name={active.name}
                projectId={projectId}
                deliverableId={active.id}
                accessToken={accessToken}
                workbenchTool={selectedLayer === "orthomosaic" ? workbenchTool : "select"}
                toolSet={toolSet}
                viewerLabel={LAYER_LABELS[selectedLayer]}
                allowMeasurements={selectedLayer === "orthomosaic"}
              />
            ) : null}
            {active && selectedLayer === "3d_model" ? <Model3DViewer signedUrl={signedUrls[active.id] ?? null} name={active.name} /> : null}
            {active && selectedLayer === "point_cloud" ? (
              <PointCloudViewer
                signedUrl={signedUrls[active.id] ?? null}
                name={active.name}
                projectId={projectId}
                deliverableId={active.id}
                accessToken={accessToken}
                hasPotree={!!active.potree}
              />
            ) : null}
          </div>
        </>
      )}

      {previewError && <p style={{ color: V.danger, fontSize: 12, marginBottom: 20 }}>{previewError}</p>}

      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10, marginTop: availableLayers.length > 0 ? 0 : 8 }}>
        All outputs
      </div>
      <MappingDeliverables deliverables={deduped} accessToken={accessToken} projectId={projectId} />
    </div>
  );
}
