"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

const PHASES = ["planning", "preflight", "onsite", "flight", "postflight", "submission"] as const;
const AUTOMATIC_ITEMS = new Set(["insurance_verified", "deliverables_uploaded", "mission_submitted"]);

interface WorkflowItem {
  id: string;
  phase: string;
  item_key: string;
  label: string;
  completed: boolean;
}

interface WorkflowData {
  items: WorkflowItem[];
  job: { checked_in_at: string | null; started_at: string | null; completed_at: string | null };
  assignmentStatus: string;
  insurance: { verified: boolean; source: string | null; expiresOn: string | null; gigEligible: boolean };
  submission: { ready: boolean; blockers: string[]; submitted: boolean };
}

export default function PilotFieldWorkflow({
  assignmentId,
  refreshKey = 0,
  onChanged,
}: {
  assignmentId: string;
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBlockers, setActionBlockers] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [incidentSummary, setIncidentSummary] = useState("");
  const [incidentDetails, setIncidentDetails] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
    if (!sessionData.session) {
      setLoadError("Your session expired. Sign in again to continue.");
      return;
    }
    const response = await fetch(`/api/pilot/missions/${assignmentId}/workflow`, {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLoadError(body.error ?? "Field workflow could not be loaded.");
      return;
    }
    setData(body);
  }, [assignmentId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const completed = useMemo(() => data?.items.filter((item) => item.completed).length ?? 0, [data]);
  const percent = data ? Math.round((completed / Math.max(1, data.items.length)) * 100) : 0;

  async function act(body: Record<string, unknown>, label: string) {
    setBusyAction(label);
    setActionError(null);
    setActionBlockers([]);
    try {
      const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
      if (!sessionData.session) throw new Error("Your session expired. Sign in again to continue.");
      const response = await fetch(`/api/pilot/missions/${assignmentId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify(body),
      });
      const output = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionBlockers(Array.isArray(output.blockers) ? output.blockers : []);
        throw new Error(output.error ?? "The workflow could not be updated.");
      }
      if (body.action === "incident") {
        setShowIncident(false);
        setIncidentSummary("");
        setIncidentDetails("");
      }
      await load();
      onChanged?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The workflow could not be updated.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loadError) return <Panel><p role="alert" style={{ color: V.danger, fontSize: 13 }}>{loadError}</p></Panel>;
  if (!data) return <Panel><p style={{ color: V.inkDim, fontSize: 13 }}>Loading field workflow…</p></Panel>;

  const insured = data.insurance.verified;
  const nextAction = data.submission.submitted
    ? "Submitted to DOM for QC"
    : data.submission.ready
      ? "Ready to submit for QC"
      : data.submission.blockers[0] ?? "Continue the required checklist";

  return (
    <details style={panelStyle}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="font-mono-ibm" style={{ fontSize: 12, color: V.signal, textTransform: "uppercase", letterSpacing: ".1em" }}>Field Workflow</div>
            <strong style={{ display: "block", marginTop: 4 }}>{percent}% complete · {completed}/{data.items.length} steps</strong>
            <span style={{ color: data.submission.ready || data.submission.submitted ? V.telemetry : V.inkDim, fontSize: 12 }}>{nextAction}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div aria-hidden="true" style={{ width: 150, height: 8, borderRadius: 8, background: V.raised, overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: percent === 100 ? V.telemetry : V.signal }} />
            </div>
            <span style={{ color: V.inkDim, fontSize: 12 }}>Open ▾</span>
          </div>
        </div>
      </summary>

      <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 16, paddingTop: 16 }}>
        <div aria-live="polite" style={{ padding: 12, borderRadius: 9, border: `1px solid ${insured ? V.telemetry : V.danger}`, background: insured ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)" }}>
          <strong style={{ color: insured ? V.telemetry : V.danger, fontSize: 12 }}>{insured ? "✓ Mandatory insurance verified" : "Insurance verification required"}</strong>
          <div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>
            {insured
              ? `${data.insurance.source}${data.insurance.expiresOn ? ` · expires ${new Date(data.insurance.expiresOn).toLocaleDateString()}` : ""}`
              : data.insurance.gigEligible
                ? "DOM must bind and verify gig coverage for this assignment before work begins."
                : "Upload a current COI in Pilot Profile before continuing."}
          </div>
        </div>

        <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: V.raised, border: `1px solid ${V.line}` }}>
          <strong style={{ color: V.ink, fontSize: 12 }}>Site safety</strong>
          <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>Use the PPE and perimeter controls required by the site and approved risk plan.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            <a href="/safety-equipment" target="_blank" rel="noreferrer" style={linkStyle}>Safety equipment ↗</a>
            <a href="/shop" target="_blank" rel="noreferrer" style={linkStyle}>DOM Shop ↗</a>
          </div>
        </div>

        {(actionError || actionBlockers.length > 0) && (
          <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 9, border: `1px solid ${V.danger}`, background: "rgba(220,38,38,.08)" }}>
            {actionError && <strong style={{ color: V.danger, fontSize: 12 }}>{actionError}</strong>}
            {actionBlockers.length > 0 && <ul style={{ color: V.inkDim, fontSize: 12, margin: "7px 0 0 18px" }}>{actionBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 14, opacity: insured ? 1 : 0.55 }}>
          {PHASES.map((phase) => (
            <section key={phase}>
              <h4 style={{ fontSize: 11, textTransform: "uppercase", color: V.inkFaint, letterSpacing: ".08em" }}>{phase}</h4>
              {data.items.filter((item) => item.phase === phase).map((item) => (
                <label key={item.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 0", fontSize: 13, color: item.completed ? V.inkDim : V.ink }}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={!insured || AUTOMATIC_ITEMS.has(item.item_key) || busyAction !== null}
                    onChange={(event) => act({ action: "checklist", itemId: item.id, completed: event.target.checked }, item.id)}
                  />
                  <span style={{ textDecoration: item.completed ? "line-through" : "none" }}>
                    {item.label}
                    {AUTOMATIC_ITEMS.has(item.item_key) && <small style={{ display: "block", color: V.inkFaint, textDecoration: "none" }}>Updates automatically</small>}
                  </span>
                </label>
              ))}
            </section>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {!data.job.checked_in_at && <ActionButton disabled={!insured || busyAction !== null} busy={busyAction === "check_in"} onClick={() => act({ action: "check_in" }, "check_in")}>Check in on site</ActionButton>}
          {data.job.checked_in_at && !data.job.started_at && <ActionButton disabled={!insured || busyAction !== null} busy={busyAction === "start_flight"} onClick={() => act({ action: "start_flight" }, "start_flight")}>Start flight operations</ActionButton>}
          {data.job.started_at && !data.job.completed_at && <ActionButton disabled={!insured || busyAction !== null} busy={busyAction === "field_complete"} onClick={() => act({ action: "field_complete" }, "field_complete")}>Mark field capture complete</ActionButton>}
          <button type="button" style={dangerButton} onClick={() => setShowIncident((visible) => !visible)}>Report safety incident</button>
        </div>

        {data.job.completed_at && !data.submission.submitted && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: `1px solid ${data.submission.ready ? V.telemetry : V.line}`, background: data.submission.ready ? "rgba(22,163,74,.08)" : V.raised }}>
            <strong style={{ fontSize: 13 }}>Final step: submit to DOM for QC</strong>
            {!data.submission.ready && <p style={{ color: V.inkDim, fontSize: 11, marginTop: 5 }}>{data.submission.blockers.length} item{data.submission.blockers.length === 1 ? " remains" : "s remain"}. Finish the checklist and upload a deliverable.</p>}
            <ActionButton
              disabled={!data.submission.ready || busyAction !== null}
              busy={busyAction === "submit_for_qc"}
              onClick={() => {
                if (window.confirm("Submit this mission and its deliverables to DOM for QC?")) act({ action: "submit_for_qc" }, "submit_for_qc");
              }}
            >Submit mission for QC</ActionButton>
          </div>
        )}
        {data.submission.submitted && <p role="status" style={{ color: V.telemetry, fontSize: 13, marginTop: 14 }}>✓ Mission submitted. DOM can now review the deliverables.</p>}

        {showIncident && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <input value={incidentSummary} onChange={(event) => setIncidentSummary(event.target.value)} placeholder="What happened?" style={inputStyle} />
            <textarea value={incidentDetails} onChange={(event) => setIncidentDetails(event.target.value)} placeholder="Details, conditions, and actions taken…" style={{ ...inputStyle, minHeight: 80 }} />
            <button type="button" disabled={!incidentSummary.trim() || busyAction !== null} style={{ ...dangerButton, opacity: incidentSummary.trim() ? 1 : 0.5 }} onClick={() => act({ action: "incident", summary: incidentSummary, details: incidentDetails, severity: "observation" }, "incident")}>{busyAction === "incident" ? "Submitting…" : "Submit safety report"}</button>
          </div>
        )}
      </div>
    </details>
  );
}

function ActionButton({ children, disabled, busy, onClick }: { children: React.ReactNode; disabled: boolean; busy: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ ...primaryButton, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>{busy ? "Working…" : children}</button>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={panelStyle}>{children}</div>;
}

const panelStyle: React.CSSProperties = { padding: 18, border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface };
const primaryButton: React.CSSProperties = { padding: "9px 13px", border: 0, borderRadius: 8, background: V.signal, color: V.ground, fontWeight: 700 };
const dangerButton: React.CSSProperties = { ...primaryButton, background: "transparent", border: `1px solid ${V.danger}`, color: V.danger, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink };
const linkStyle: React.CSSProperties = { color: V.signal, fontSize: 11, fontWeight: 700 };
