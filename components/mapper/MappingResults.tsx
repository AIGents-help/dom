"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "./theme";
import OrthomosaicViewer from "./OrthomosaicViewer";
import Model3DViewer from "./Model3DViewer";
import PointCloudViewer from "./PointCloudViewer";
import MappingDeliverables from "./MappingDeliverables";
import type { MappingDeliverable } from "./types";

// Orchestrates the three output viewers (each structure-only this pass —
// see their own files) plus the full deliverables list. Picks the most
// recent deliverable of each relevant type and resolves a signed URL for
// it via the browser's own session, same pattern as MappingDeliverables.
export default function MappingResults({ deliverables }: { deliverables: MappingDeliverable[] }) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const orthomosaic = deliverables.find((d) => d.type === "orthomosaic") ?? null;
  const model3d = deliverables.find((d) => d.type === "3d_model") ?? null;
  const pointCloud = deliverables.find((d) => d.type === "point_cloud") ?? null;

  useEffect(() => {
    const targets = [orthomosaic, model3d, pointCloud].filter((d): d is MappingDeliverable => !!d?.storage_url);
    if (targets.length === 0) return;
    (async () => {
      const sb = getSupabaseBrowser();
      const entries = await Promise.all(
        targets.map(async (d) => {
          const { data } = await sb.storage.from("mission-deliverables").createSignedUrl(d.storage_url!, 3600);
          return [d.id, data?.signedUrl ?? ""] as const;
        })
      );
      setSignedUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orthomosaic?.id, model3d?.id, pointCloud?.id]);

  const hasAnyOutput = orthomosaic || model3d || pointCloud;

  return (
    <div>
      {!hasAnyOutput ? (
        <p style={{ color: V.inkFaint, fontSize: 13, marginBottom: 16 }}>
          No processed outputs yet — they'll appear here once the worker finishes and registers deliverables for this job.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {orthomosaic && <OrthomosaicViewer signedUrl={signedUrls[orthomosaic.id] ?? null} name={orthomosaic.name} />}
          {model3d && <Model3DViewer signedUrl={signedUrls[model3d.id] ?? null} name={model3d.name} />}
          {pointCloud && <PointCloudViewer signedUrl={signedUrls[pointCloud.id] ?? null} name={pointCloud.name} />}
        </div>
      )}

      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10 }}>
        All outputs
      </div>
      <MappingDeliverables deliverables={deliverables} />
    </div>
  );
}
