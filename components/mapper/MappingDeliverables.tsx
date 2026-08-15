"use client";

import { useState } from "react";
import { deliverableHasFile } from "@/lib/mapperPipeline";
import { V, panelStyle, btnGhost } from "./theme";
import type { MappingDeliverable } from "./types";

// Lists completed customer-facing outputs for this project's job — reads
// directly from the EXISTING `deliverables` table (no parallel system).
// The signed/authorized download URL is minted server-side (see
// app/api/pilot/mapping/projects/[id]/deliverables/[deliverableId]/
// download/route.ts) rather than client-side: the mission-deliverables
// bucket's storage.objects RLS policy authorizes via an accepted
// mission_assignments row, which mapper pilots don't necessarily have (they're
// authorized via mapping_projects.contractor_id instead) -- signing from the
// browser's own session was silently rejected by RLS for exactly that case.
export default function MappingDeliverables({
  deliverables,
  accessToken,
  projectId,
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function download(d: MappingDeliverable) {
    setErrors((e) => ({ ...e, [d.id]: "" }));
    setLoading(d.id);
    try {
      const res = await fetch(`/api/pilot/mapping/projects/${projectId}/deliverables/${d.id}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        setErrors((e) => ({ ...e, [d.id]: body.error ?? "Could not generate a download link." }));
        return;
      }
      window.open(body.url, "_blank");
    } catch {
      setErrors((e) => ({ ...e, [d.id]: "Network error — try again." }));
    } finally {
      setLoading(null);
    }
  }

  if (deliverables.length === 0) {
    return <p style={{ color: V.inkFaint, fontSize: 13 }}>No completed outputs registered for this job yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {deliverables.map((d) => {
        const hasFile = deliverableHasFile(d);
        return (
          <div key={d.id} style={{ ...panelStyle, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: V.ink, fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                <div className="font-mono-ibm" style={{ color: V.inkFaint, fontSize: 11, marginTop: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {(d.type ?? "output").replace(/_/g, " ")} · {d.qc_passed ? "QC passed" : "Pending QC"}
                </div>
              </div>
              <button
                onClick={() => download(d)}
                disabled={!hasFile || loading === d.id}
                style={{ ...btnGhost, padding: "6px 12px", fontSize: 12, opacity: hasFile ? 1 : 0.5, cursor: hasFile ? "pointer" : "not-allowed" }}
              >
                {!hasFile ? "Unavailable" : loading === d.id ? "…" : "Download"}
              </button>
            </div>
            {errors[d.id] && (
              <p style={{ color: V.danger, fontSize: 12, marginTop: 8 }}>{errors[d.id]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
