"use client";

import { useEffect, useState } from "react";
import type { ProjectRecords } from "@/lib/dominicProjectRecords";

type Props = {
  projectId: string | null; accessToken: string;
  onChooseProject: () => void;
  onOpenPlan: (planId: string, live: boolean) => void;
  onReview: (assetId: string, inspectionId: string) => void;
};
const button = { background: "#202B35", color: "#F5F7FA", border: "1px solid #354553", borderRadius: 8, padding: "9px 12px", cursor: "pointer" };
const panel = { background: "#131C24", border: "1px solid #26323D", borderRadius: 10, padding: 16, minWidth: 0 };
type Snapshot = ProjectRecords & { project: { id: string; name: string }; loadedAt: number };

export default function DominicHubOperations({ projectId, accessToken, onChooseProject, onOpenPlan, onReview }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/pilot/mapping/projects/${projectId}`, { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${accessToken}` } });
        const body = await response.json();
        if (!response.ok || body.recordsError) throw new Error(body.error ?? body.recordsError ?? "Project operations unavailable.");
        if (body.project?.id !== projectId || !Array.isArray(body.capturePlans) || !Array.isArray(body.inspections) || !Array.isArray(body.findings)) throw new Error("Project operations returned incomplete records.");
        if (active) { setSnapshot({ ...body, loadedAt: Date.now() }); setError(""); }
      } catch (cause) {
        // Failed refreshes must not leave old counts looking current.
        if (active) { setSnapshot(null); setError(cause instanceof Error ? cause.message : "Project operations unavailable."); }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [projectId, accessToken, refresh]);
  const current = snapshot?.project.id === projectId ? snapshot : null;
  const pending = current?.findings.filter((finding) => finding.review_status === "needs_review") ?? [];
  const priority = pending.filter((finding) => finding.severity === "high" || finding.severity === "critical");
  return <section aria-label="HUB project operations" style={{ minWidth: 0 }}>
    <h2 style={{ fontSize: 22, margin: "0 0 8px" }}>Project operations</h2>
    <p style={{ color: "#A7B0BA", lineHeight: 1.6 }}>Saved project records, not live fleet telemetry. Review candidates and open the exact saved capture plan for manual field work. No HUB action launches an aircraft.</p>
    {!projectId ? <div style={panel}><p>Select a project to load its operational records. Simulation data is kept separately.</p><button type="button" style={button} onClick={onChooseProject}>Choose operations project</button></div> : <>
      <button type="button" style={button} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Refresh project operations</button>
      {loading ? <p role="status">Loading project operations…</p> : null}
      {error ? <p role="alert" style={{ color: "#FFB565" }}>{error} Records are unavailable; no readiness is inferred.</p> : null}
      {current ? <>
        <h3>{current.project.name}</h3>
        <p style={{ color: "#A7B0BA", fontSize: 12 }}>Snapshot loaded {new Date(current.loadedAt).toLocaleTimeString()}. Refreshes every 30 seconds while visible. Counts cover returned records, not a fleet-wide total.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          {[["Saved plans", current.capturePlans.length], ["Linked inspections", current.inspections.length], ["Candidates awaiting review", pending.length], ["High / critical candidates", priority.length]].map(([label, count]) => <div key={label} style={panel}><strong style={{ display: "block", fontSize: 25 }}>{count}</strong><span>{label}</span></div>)}
        </div>
        <div style={{ ...panel, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Field capture plans</h3>
          {!current.capturePlans.length ? <p>No capture plans linked to this project.</p> : current.capturePlans.map((plan) => <article key={plan.id} style={{ borderTop: "1px solid #26323D", padding: "12px 0", overflowWrap: "anywhere" }}>
            <strong>{plan.name}</strong><p style={{ color: "#A7B0BA", fontSize: 12 }}>{plan.mission_type} · Saved plan; flight readiness not assessed</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" style={button} onClick={() => onOpenPlan(plan.id, false)} aria-label={`Edit HUB plan ${plan.name}`}>Edit plan</button><button type="button" style={button} onClick={() => onOpenPlan(plan.id, true)} aria-label={`Open HUB live capture ${plan.name}`}>Open live capture</button></div>
          </article>)}
        </div>
        <div style={{ ...panel, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Inspection review queue</h3>
          {!current.inspections.length ? <p>No inspections linked to this project.</p> : current.inspections.map((inspection) => {
            const candidates = pending.filter((finding) => finding.inspection_id === inspection.id);
            return <article key={inspection.id} style={{ borderTop: "1px solid #26323D", padding: "12px 0", overflowWrap: "anywhere" }}>
              <strong>{inspection.asset_name}</strong><p style={{ color: "#A7B0BA", fontSize: 12 }}>{inspection.inspection_type} · Saved status: {inspection.status} · {candidates.length} candidates awaiting review</p>
              {candidates.slice(0, 5).map((finding) => <p key={finding.id} style={{ fontSize: 13 }}>{finding.severity} · {finding.title} · unconfirmed candidate</p>)}
              {candidates.length > 5 ? <p>{candidates.length - 5} more candidates in inspection review.</p> : null}
              <button type="button" style={button} onClick={() => onReview(inspection.asset_id, inspection.id)} aria-label={`Review HUB inspection ${inspection.asset_name}`}>Review evidence</button>
            </article>;
          })}
        </div>
      </> : null}
    </>}
    <div style={{ ...panel, marginTop: 16, color: "#FFB565" }}><strong>Hardware status: not assessed by HUB</strong><p>Open live capture to connect and verify the aircraft bridge. Dock dispatch, autonomous scheduling, weather clearance, thermal measurements and LDAR feeds are not connected here. Matrice 4E RGB captures do not provide thermal or gas measurements.</p></div>
  </section>;
}
