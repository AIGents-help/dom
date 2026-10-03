"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import type { ProjectInspection } from "@/lib/dominicProjectRecords";
import DominicInspectionEvidenceReview from "./DominicInspectionEvidenceReview";
import { V, btnGhost } from "@/components/mapper/theme";

type Context = {
  inspection: { id: string; asset_id: string; inspection_type: string; objective: string | null; status: string; sensor_modes: string[] };
  asset: { id: string; name: string; asset_type: string };
};
export default function DominicIntelligentInspection({ projectId, accessToken, initialInspectionId, onOpenAssets }: {
  projectId: string; accessToken: string; initialInspectionId?: string | null;
  onOpenAssets: (assetId?: string, inspectionId?: string) => void;
}) {
  const [inspections, setInspections] = useState<ProjectInspection[]>([]);
  const [selectedId, setSelectedId] = useState(initialInspectionId ?? "");
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch(`/api/pilot/mapping/projects/${projectId}`, { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await response.json();
      if (!response.ok || body.recordsError) throw new Error(body.error ?? body.recordsError ?? "Project inspections unavailable.");
      if (!active) return;
      const rows: ProjectInspection[] = body.inspections ?? [];
      setInspections(rows);
      setSelectedId((id) => rows.some((row) => row.id === id) ? id : rows[0]?.id ?? "");
      setLoading(false);
    })().catch((error) => { if (active) { setError(error instanceof Error ? error.message : "Inspections unavailable."); setLoading(false); } });
    return () => { active = false; };
  }, [projectId, accessToken]);
  useEffect(() => {
    if (!selectedId || !inspections.some((row) => row.id === selectedId)) return;
    let active = true;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data: userResult } = await sb.auth.getUser();
      if (!userResult.user) throw new Error("Your session expired.");
      const { data: inspection, error } = await sb.from("dominic_inspections")
        .select("id,asset_id,inspection_type,objective,status,sensor_modes").eq("id", selectedId).eq("user_id", userResult.user.id).single();
      if (error) throw error;
      const assetResult = await sb.from("dominic_assets").select("id,name,asset_type").eq("id", inspection.asset_id).eq("user_id", userResult.user.id).single();
      if (assetResult.error) throw assetResult.error;
      if (active) { setContext({ inspection, asset: assetResult.data }); setError(""); }
    })().catch((error) => { if (active) setError(error instanceof Error ? error.message : "Inspection could not be loaded."); });
    return () => { active = false; };
  }, [selectedId, inspections]);
  const selectedContext = context?.inspection.id === selectedId ? context : null;
  return <section aria-label="Intelligent Inspection" style={{ padding: "20px clamp(12px,3vw,32px)", minWidth: 0 }}>
    <h1 style={{ fontSize: 25, color: V.ink }}>Intelligent Inspection</h1>
    <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.6 }}>Review incoming inspection images, open anomaly callouts, compare linked previous evidence and generate a report with images.</p>
    {error ? <p role="alert" style={{ color: V.warn }}>{error}</p> : null}
    {loading ? <p>Loading project inspections…</p> : inspections.length ? <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <label style={{ color: V.inkDim, fontSize: 12 }}>Inspection <select aria-label="Project inspection" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: V.surface, color: V.ink, padding: 9, maxWidth: "100%" }}>
          {inspections.map((row) => <option key={row.id} value={row.id}>{row.asset_name} · {row.inspection_type} · {row.status}</option>)}
        </select></label>
        <button type="button" style={btnGhost} onClick={() => { const row = inspections.find((item) => item.id === selectedId); if (row) onOpenAssets(row.asset_id, row.id); }}>Open asset & capture setup</button>
      </div>
      {selectedContext ? <DominicInspectionEvidenceReview key={selectedId} inspection={selectedContext.inspection} asset={selectedContext.asset} watchIncoming /> : <p>Loading selected inspection…</p>}
    </> : <>
      <p style={{ color: V.inkDim }}>No inspections linked to this project yet. Create an asset inspection and choose this project when saving its capture plan.</p>
      <button type="button" style={btnGhost} onClick={() => onOpenAssets()}>Create an asset inspection</button>
    </>}
  </section>;
}
