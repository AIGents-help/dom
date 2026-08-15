"use client";

import { useEffect, useState } from "react";
import { dedupeDeliverables } from "@/lib/mapperPipeline";
import { V } from "./theme";
import OrthomosaicViewer from "./OrthomosaicViewer";
import Model3DViewer from "./Model3DViewer";
import PointCloudViewer from "./PointCloudViewer";
import MappingDeliverables from "./MappingDeliverables";
import type { MappingDeliverable } from "./types";

// Orchestrates the three output viewers (each structure-only this pass —
// see their own files) plus the full deliverables list. Picks the most
// recent, most-trustworthy deliverable of each relevant type (see
// dedupeDeliverables — a worker retry can register more than one row for
// the same underlying output) and resolves a download URL for it
// server-side, same route as MappingDeliverables.
export default function MappingResults({
  deliverables,
  accessToken,
  projectId,
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);

  const deduped = dedupeDeliverables(deliverables);
  const orthomosaic = deduped.find((d) => d.type === "orthomosaic") ?? null;
  const model3d = deduped.find((d) => d.type === "3d_model") ?? null;
  const pointCloud = deduped.find((d) => d.type === "point_cloud") ?? null;

  useEffect(() => {
    const targets = [orthomosaic, model3d, pointCloud].filter((d): d is MappingDeliverable => !!d?.storage_url || !!d?.external_file_id);
    if (targets.length === 0) return;
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
      setSignedUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      if (failures.length > 0) setPreviewError(failures.join(" · "));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orthomosaic?.id, model3d?.id, pointCloud?.id, projectId, accessToken]);

  const hasAnyOutput = orthomosaic || model3d || pointCloud;

  return (
    <div>
      {!hasAnyOutput ? (
        <p style={{ color: V.inkFaint, fontSize: 13, marginBottom: 16 }}>
          No processed outputs yet — they'll appear here once the worker finishes and registers deliverables for this job.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
          {orthomosaic && <OrthomosaicViewer signedUrl={signedUrls[orthomosaic.id] ?? null} name={orthomosaic.name} />}
          {model3d && <Model3DViewer signedUrl={signedUrls[model3d.id] ?? null} name={model3d.name} />}
          {pointCloud && <PointCloudViewer signedUrl={signedUrls[pointCloud.id] ?? null} name={pointCloud.name} />}
        </div>
      )}

      {previewError && (
        <p style={{ color: V.danger, fontSize: 12, marginBottom: 20 }}>{previewError}</p>
      )}

      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10, marginTop: hasAnyOutput ? 0 : 8 }}>
        All outputs
      </div>
      <MappingDeliverables deliverables={deduped} accessToken={accessToken} projectId={projectId} />
    </div>
  );
}
