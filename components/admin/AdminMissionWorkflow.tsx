"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";
import { workflowProgress } from "@/lib/missionWorkflow";

interface WorkflowItem {
  id: string;
  phase: string;
  item_key: string;
  label: string;
  completed: boolean;
  notes: string | null;
  automatic: boolean;
  protected: boolean;
}

interface AssignmentWorkflow {
  id: string;
  status: string;
  pilotName: string;
  part107Verified: boolean;
  insurance: { verified: boolean; source: string | null };
  assignedUav: string | null;
  items: WorkflowItem[];
  submission: { ready: boolean; blockers: string[]; submitted: boolean };
}

interface WorkflowResponse {
  deliverablePlan: Array<{ type: string; label: string; guidance: string; required: boolean; uploaded: boolean }>;
  assignments: AssignmentWorkflow[];
}

export default function AdminMissionWorkflow({ missionId, onChanged }: { missionId: string; onChanged?: () => void }) {
  const [data, setData] = useState<WorkflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: session } = await getSupabaseBrowser().auth.getSession();
    setError(null);
    if (!session.session) return setError("Admin session expired.");
    const response = await fetch(`/api/admin/missions/${missionId}/workflow`, {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error ?? "Mission workflow could not be loaded.");
    setData(body);
  }, [missionId]);

  useEffect(() => {
    // Authenticated mission state is intentionally loaded after the client session hydrates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(assignmentId: string, action: string, itemId?: string, reason?: string) {
    const key = `${assignmentId}-${itemId ?? action}`;
    setBusy(key);
    setError(null);
    try {
      const { data: session } = await getSupabaseBrowser().auth.getSession();
      if (!session.session) throw new Error("Admin session expired.");
      const response = await fetch(`/api/admin/missions/${missionId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ assignmentId, action, itemId, reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blockers = Array.isArray(body.blockers) ? ` ${body.blockers.join(" · ")}` : "";
        throw new Error(`${body.error ?? "Workflow could not be updated."}${blockers}`);
      }
      await load();
      onChanged?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Workflow could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  const progress = useMemo(() => workflowProgress(data?.assignments.flatMap((assignment) => assignment.items) ?? []), [data]);

  return (
    <details style={panelStyle} open>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="font-mono-ibm" style={{ color: V.signal, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" }}>Admin Workflow Control</div>
            <strong style={{ display: "block", marginTop: 4 }}>{progress.prerequisitesCompleted}/{progress.prerequisitesTotal || 20} requirements complete</strong>
            <small style={{ display: "block", color: V.inkFaint, marginTop: 2 }}>{progress.submitted ? "Submitted to QC" : "QC submission is the final action"}</small>
          </div>
          <span style={{ color: V.inkDim, fontSize: 12 }}>Collapse ▴</span>
        </div>
      </summary>

      <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 14, paddingTop: 14 }}>
        <p style={{ color: V.inkDim, fontSize: 12, lineHeight: 1.5 }}>
          Complete a step for the pilot, waive a non-applicable step with a reason, or reopen it. Part 107, insurance, UAV assignment, uploads, and submission stay tied to verified system data.
        </p>
        {error && <div role="alert" style={{ marginTop: 10, padding: 10, borderRadius: 8, border: `1px solid ${V.danger}`, color: V.danger, fontSize: 12 }}>{error}</div>}
        {!data && !error && <p style={{ color: V.inkDim, fontSize: 12, marginTop: 12 }}>Loading workflow…</p>}
        {data?.assignments.length === 0 && <p style={{ color: V.inkDim, fontSize: 12, marginTop: 12 }}>No active pilot assignment.</p>}

        {data?.assignments.map((assignment) => (
          <section key={assignment.id} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <strong>{assignment.pilotName}</strong>
                <div style={{ color: V.inkDim, fontSize: 11, marginTop: 3 }}>
                  Part 107 {assignment.part107Verified ? "✓" : "required"} · Insurance {assignment.insurance.verified ? "✓" : "required"} · UAV {assignment.assignedUav ?? "required"}
                </div>
              </div>
              <span style={{ color: assignment.submission.submitted ? V.telemetry : assignment.submission.ready ? V.telemetry : V.warn, fontSize: 11, fontWeight: 700 }}>
                {assignment.submission.submitted ? "SUBMITTED TO QC" : assignment.submission.ready ? "READY FOR QC" : `${assignment.submission.blockers.length} REMAINING`}
              </span>
            </div>

            {!assignment.submission.submitted && assignment.submission.blockers.length > 0 && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(245,158,11,.08)", border: `1px solid ${V.warn}` }}>
                <strong style={{ color: V.warn, fontSize: 11 }}>Required before QC</strong>
                <ul style={{ color: V.inkDim, fontSize: 11, lineHeight: 1.5, margin: "6px 0 0 17px" }}>
                  {assignment.submission.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            )}

            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              {assignment.items.map((item) => {
                const itemBusy = busy === `${assignment.id}-${item.id}`;
                return (
                  <div key={item.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${item.completed ? V.lineSoft : V.line}`, background: item.completed ? "rgba(22,163,74,.04)" : V.raised }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 220, flex: 1 }}>
                        <div style={{ color: item.completed ? V.telemetry : V.ink, fontSize: 12, fontWeight: 600 }}>{item.completed ? "✓ " : "○ "}{item.label}</div>
                        <div style={{ color: V.inkFaint, fontSize: 10, marginTop: 3, textTransform: "uppercase" }}>{item.phase}{item.automatic ? " · automatic" : ""}</div>
                        {item.notes && <div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>{item.notes}</div>}
                      </div>
                      {!item.automatic && !item.protected && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {item.completed ? (
                              <button disabled={itemBusy} onClick={() => {
                                const reason = window.prompt(`Why are you reopening “${item.label}”?`);
                                if (reason !== null) act(assignment.id, "reopen", item.id, reason);
                              }} style={smallGhost}>{itemBusy ? "…" : "Reopen"}</button>
                          ) : (
                            <>
                              <button disabled={itemBusy} onClick={() => {
                                const reason = window.prompt(`Why is DOM completing “${item.label}” for this pilot?`);
                                if (reason !== null) act(assignment.id, "complete", item.id, reason);
                              }} style={smallPrimary}>{itemBusy ? "…" : "Complete for pilot"}</button>
                              <button disabled={itemBusy} onClick={() => {
                                const reason = window.prompt(`Why is “${item.label}” not applicable?`);
                                if (reason !== null) act(assignment.id, "waive", item.id, reason);
                              }} style={smallGhost}>Waive</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!assignment.submission.submitted && (
              <button
                disabled={!assignment.submission.ready || busy !== null}
                onClick={() => window.confirm(`Submit ${assignment.pilotName}'s mission to DOM QC?`) && act(assignment.id, "submit_for_qc")}
                style={{ ...primaryButton, marginTop: 12, opacity: assignment.submission.ready && busy === null ? 1 : .5 }}
              >
                {busy === `${assignment.id}-submit_for_qc` ? "Submitting…" : "Submit to QC for Pilot"}
              </button>
            )}
          </section>
        ))}

        {data && (
          <section style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
            <strong style={{ fontSize: 12 }}>Required deliverables for this mission</strong>
            <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
              {data.deliverablePlan.map((item) => (
                <div key={`${item.type}-${item.label}`} style={{ fontSize: 11, color: item.uploaded ? V.telemetry : item.required ? V.warn : V.inkDim }}>
                  {item.uploaded ? "✓" : item.required ? "○" : "△"} <strong>{item.label}</strong> — {item.guidance}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

const panelStyle: React.CSSProperties = { border: `1px solid ${V.signal}`, borderRadius: 14, background: V.surface, padding: 18 };
const primaryButton: React.CSSProperties = { padding: "9px 14px", borderRadius: 8, border: 0, background: V.signal, color: "#FFFFFF", fontWeight: 700, cursor: "pointer" };
const smallPrimary: React.CSSProperties = { ...primaryButton, padding: "6px 9px", fontSize: 11 };
const smallGhost: React.CSSProperties = { padding: "6px 9px", borderRadius: 7, border: `1px solid ${V.line}`, background: V.surface, color: V.ink, fontSize: 11, fontWeight: 600, cursor: "pointer" };
