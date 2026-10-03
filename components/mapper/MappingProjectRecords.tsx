"use client";

import { V, btnGhost } from "./theme";
import type { ProjectRecords } from "@/lib/dominicProjectRecords";

export default function MappingProjectRecords({ records, online, onOpenPlan, onOpenInspection }: {
  records: ProjectRecords;
  online: boolean;
  onOpenPlan: (planId: string | null) => void;
  onOpenInspection: (assetId: string, inspectionId: string) => void;
}) {
  return <section id="dominic-project-records" aria-label="Project plans and inspections" style={{ scrollMarginTop: 96 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <h2 style={{ color: V.ink, fontSize: 19 }}>Plans & inspections</h2>
      <button type="button" disabled={!online} style={btnGhost} onClick={() => onOpenPlan(null)}>New project capture plan</button>
    </div>
    <p style={{ color: V.inkDim, fontSize: 13 }}>Capture plans linked to this project and the inspections that used them.</p>
    {records.recordsError ? <p role="alert" style={{ color: V.warn, fontSize: 12 }}>{records.recordsError}</p> : null}
    {records.capturePlans.length === 0 && !records.recordsError ? <p style={{ color: V.inkFaint, fontSize: 13 }}>No linked plans yet. Create a plan here, or choose this project when saving an existing plan.</p> : null}
    {records.capturePlans.map((plan) => <article key={plan.id} style={{ borderTop: `1px solid ${V.line}`, padding: "15px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div><strong style={{ color: V.ink }}>{plan.name}</strong><div style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>{plan.mission_type} · Updated {new Date(plan.updated_at).toLocaleDateString()}</div></div>
        <button type="button" disabled={!online} aria-label={`Open capture plan ${plan.name}`} style={btnGhost} onClick={() => onOpenPlan(plan.id)}>Open plan</button>
      </div>
    </article>)}
    <h3 style={{ color: V.ink, fontSize: 16, marginTop: 20 }}>Inspections</h3>
    {!records.inspections.length && !records.recordsError ? <p style={{ color: V.inkFaint, fontSize: 12 }}>No linked inspections yet. Plans used for an asset inspection bring its evidence into this project.</p> : null}
    {records.inspections.map((inspection) => <article key={inspection.id} style={{ borderTop: `1px solid ${V.line}`, padding: "14px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <strong style={{ color: V.ink, fontSize: 13 }}>{inspection.asset_name}</strong>
        <span style={{ color: V.inkDim, fontSize: 12 }}>{inspection.inspection_type} · {inspection.status}</span>
        <button type="button" disabled={!online} aria-label={`Review inspection of ${inspection.asset_name}`} style={{ ...btnGhost, fontSize: 11 }} onClick={() => onOpenInspection(inspection.asset_id, inspection.id)}>Review inspection</button>
      </div>
      {inspection.objective || inspection.summary ? <p style={{ color: V.inkDim, fontSize: 12 }}>{inspection.summary || inspection.objective}</p> : null}
      <ul style={{ paddingLeft: 18, color: V.inkDim, fontSize: 12 }}>
        {records.findings.filter((finding) => finding.inspection_id === inspection.id).map((finding) => <li key={finding.id}>{finding.title} · {finding.severity} · {finding.review_status.replaceAll("_", " ")}</li>)}
      </ul>
    </article>)}
    {!online ? <p style={{ color: V.warn, fontSize: 12 }}>Offline snapshot — reconnect to open or create records.</p> : null}
  </section>;
}
