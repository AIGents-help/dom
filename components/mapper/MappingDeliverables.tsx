"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V, panelStyle, btnGhost } from "./theme";
import type { MappingDeliverable } from "./types";

// Lists completed customer-facing outputs for this project's job — reads
// directly from the EXISTING `deliverables` table (no parallel system).
// Signed URLs are generated client-side via the browser's own session,
// exactly like components/PilotMissionLog.tsx already does for
// mission-deliverables — that bucket's storage.objects RLS policy is what
// actually authorizes this, not anything mapper-specific.
export default function MappingDeliverables({ deliverables }: { deliverables: MappingDeliverable[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function download(d: MappingDeliverable) {
    if (!d.storage_url) return;
    if (urls[d.id]) { window.open(urls[d.id], "_blank"); return; }
    setLoading(d.id);
    const sb = getSupabaseBrowser();
    const { data, error } = await sb.storage.from("mission-deliverables").createSignedUrl(d.storage_url, 300);
    setLoading(null);
    if (error || !data) return;
    setUrls((u) => ({ ...u, [d.id]: data.signedUrl }));
    window.open(data.signedUrl, "_blank");
  }

  if (deliverables.length === 0) {
    return <p style={{ color: V.inkFaint, fontSize: 13 }}>No completed outputs registered for this job yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {deliverables.map((d) => (
        <div key={d.id} style={{ ...panelStyle, display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
          <div>
            <div style={{ color: V.ink, fontSize: 13, fontWeight: 600 }}>{d.name}</div>
            <div className="font-mono-ibm" style={{ color: V.inkFaint, fontSize: 11, marginTop: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>
              {(d.type ?? "output").replace(/_/g, " ")} · {d.qc_passed ? "QC passed" : "Pending QC"}
            </div>
          </div>
          {d.storage_url && (
            <button onClick={() => download(d)} disabled={loading === d.id} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>
              {loading === d.id ? "…" : "Download"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
