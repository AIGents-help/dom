"use client";

import type { InspectionCopilotAction } from "@/lib/dominicInspectionCopilot";
import { V, btnGhost } from "@/components/mapper/theme";

export default function DominicInspectionCopilot({ actions, evidenceCount, confirmedCount, loaded, screeningReady, screeningBusy, onReview, onScreen, onCapture }: {
  actions: InspectionCopilotAction[]; evidenceCount: number; confirmedCount: number;
  loaded: boolean; screeningReady: boolean; screeningBusy: boolean;
  onReview: (findingId: string) => void; onScreen: (mediaId: string) => void;
  onCapture: () => void;
}) {
  return <section aria-label="Inspection Copilot next actions" style={{ padding: 16, borderBottom: `1px solid ${V.line}` }}>
    <h2 style={{ color: V.ink, fontSize: 19, margin: "0 0 8px" }}>Evidence-based next actions</h2>
    <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.6 }}>Priorities come from saved evidence and candidate review state. AI candidates need operator confirmation before becoming tracked issues.</p>
    {!loaded ? <p role="status">Loading inspection evidence…</p> : <>
      <p style={{ color: V.inkDim, fontSize: 13 }}>{evidenceCount} evidence items · {actions.filter((action) => action.kind === "review").length} candidates to review · {confirmedCount} confirmed findings</p>
      {!evidenceCount ? <div style={{ padding: 12, border: `1px solid ${V.line}`, borderRadius: 8 }}>
        <p style={{ color: V.ink }}>Capture evidence for this inspection</p>
        <p style={{ color: V.inkDim, fontSize: 13 }}>No saved images are available. Connect the aircraft through capture setup or add an inspection image below.</p>
        <button type="button" style={btnGhost} onClick={onCapture}>Open capture setup</button>
      </div> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {actions.map((action) => <article key={action.id} style={{ border: `1px solid ${V.line}`, borderRadius: 8, padding: 12, minWidth: 0, overflowWrap: "anywhere" }}>
          <h3 style={{ color: V.ink, fontSize: 15, margin: "0 0 6px" }}>{action.title}</h3>
          <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.6 }}>{action.reason}</p>
          {action.findingId ? <button type="button" style={btnGhost} onClick={() => { if (action.findingId) onReview(action.findingId); }}>Review candidate {action.title}</button> : <button type="button" style={btnGhost} disabled={!screeningReady || screeningBusy} onClick={() => { if (action.mediaId) onScreen(action.mediaId); }}>{screeningBusy ? "Screening in progress…" : !screeningReady ? "AI screening unavailable" : action.kind === "retry" ? `Retry screening ${action.title}` : `Screen image ${action.title}`}</button>}
        </article>)}
      </div>
      {evidenceCount && !actions.length ? <p style={{ color: V.inkDim, fontSize: 13 }}>No queued visual screening or candidate reviews. Check evidence coverage and confirmed findings before generating the report; this does not establish that the asset is defect-free.</p> : null}
    </>}
  </section>;
}
