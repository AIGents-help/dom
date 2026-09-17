"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";
import { AUTOMATIC_WORKFLOW_KEYS, workflowProgress } from "@/lib/missionWorkflow";

const WORKFLOW_STAGES = [
  { id: "before", title: "Before Flight", description: "Plan the mission, confirm compliance, inspect equipment, and prepare the site.", phases: ["planning", "preflight"] },
  { id: "during", title: "During Flight", description: "Check in, complete the site assessment, conduct the flight, and verify capture coverage.", phases: ["onsite", "flight"] },
  { id: "after", title: "After Flight", description: "Inspect the aircraft, back up media, prepare deliverables, and close out the mission.", phases: ["postflight", "submission"] },
] as const;
const AUTOMATIC_ITEMS = new Set<string>(AUTOMATIC_WORKFLOW_KEYS);

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
  insurance: { satisfied: boolean; verified: boolean; uninsuredAcknowledged: boolean; source: string | null; expiresOn: string | null; gigEligible: boolean };
  submission: { ready: boolean; blockers: string[]; submitted: boolean };
  deliverablePlan: Array<{ type: string; label: string; guidance: string; required: boolean; uploaded: boolean }>;
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
  const router = useRouter();
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBlockers, setActionBlockers] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [incidentSummary, setIncidentSummary] = useState("");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [uninsuredConsent, setUninsuredConsent] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    void refreshKey;
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

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const progress = useMemo(() => workflowProgress(data?.items ?? []), [data]);
  const percent = data ? Math.round((progress.prerequisitesCompleted / Math.max(1, progress.prerequisitesTotal)) * 100) : 0;

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
      setSavedAt(new Date());
      onChanged?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The workflow could not be updated.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loadError) return <Panel><p role="alert" style={{ color: V.danger, fontSize: 13 }}>{loadError}</p></Panel>;
  if (!data) return <Panel><p style={{ color: V.inkDim, fontSize: 13 }}>Loading field workflow…</p></Panel>;

  const insuranceSatisfied = data.insurance.satisfied;
  const uninsured = data.insurance.uninsuredAcknowledged;
  const activeStage = !data.job.checked_in_at ? "before" : !data.job.completed_at ? "during" : "after";
  const nextAction = data.submission.submitted
    ? "Mission submitted"
    : data.submission.ready
      ? "Ready to submit"
      : data.submission.blockers[0] ?? "Continue the required checklist";

  return (
    <details style={panelStyle}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="font-mono-ibm" style={{ fontSize: 12, color: V.signal, textTransform: "uppercase", letterSpacing: ".1em" }}>Field Workflow</div>
            <strong style={{ display: "block", marginTop: 4 }}>{percent}% ready · {progress.prerequisitesCompleted}/{progress.prerequisitesTotal} requirements</strong>
            <small style={{ display: "block", color: V.inkFaint, marginTop: 2 }}>Submission is the final action after all requirements are complete.</small>
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
        <div role="status" aria-live="polite" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 12, borderRadius: 9, background: "rgba(22,163,74,.08)", border: `1px solid ${V.telemetry}` }}>
          <div>
            <strong style={{ color: V.telemetry, fontSize: 12 }}>{busyAction ? "Saving your change…" : savedAt ? "✓ Progress saved" : "✓ Progress saves automatically"}</strong>
            <div style={{ color: V.inkDim, fontSize: 11, marginTop: 2 }}>{savedAt ? `Last saved at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. You can safely leave this mission.` : "Every checkbox and mission action is saved immediately. You can safely leave after the saving message finishes."}</div>
          </div>
          <button type="button" disabled={busyAction !== null} onClick={() => router.push("/pilot")} style={{ ...primaryButton, opacity: busyAction ? 0.5 : 1, cursor: busyAction ? "not-allowed" : "pointer" }}>Save &amp; Return to Missions</button>
        </div>

        <div aria-live="polite" style={{ padding: 12, borderRadius: 9, border: `1px solid ${data.insurance.verified ? V.telemetry : uninsured ? V.warn : V.danger}`, background: data.insurance.verified ? "rgba(22,163,74,.08)" : uninsured ? "rgba(245,158,11,.08)" : "rgba(220,38,38,.08)" }}>
          <strong style={{ color: data.insurance.verified ? V.telemetry : uninsured ? V.warn : V.danger, fontSize: 12 }}>{data.insurance.verified ? "✓ Insurance verified" : uninsured ? "Uninsured — responsibility acknowledged" : "Choose an insurance path"}</strong>
          <div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>
            {insuranceSatisfied
              ? `${data.insurance.source}${data.insurance.expiresOn ? ` · expires ${new Date(data.insurance.expiresOn).toLocaleDateString()}` : ""}`
              : data.insurance.gigEligible
                ? "DOM must bind and verify gig coverage for this assignment before work begins."
                : "Upload a current COI in Pilot Profile before continuing."}
          </div>
          {!insuranceSatisfied && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${V.line}` }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, color: V.ink, fontSize: 12 }}>
                <input type="checkbox" checked={uninsuredConsent} onChange={(event) => setUninsuredConsent(event.target.checked)} />
                <span>I elect to proceed without a verified insurance policy for this self-service mission. I understand this is not proof of insurance, and I remain responsible for confirming and satisfying all legal, client, property-owner, and site insurance requirements and for my independent flight operations.</span>
              </label>
              <button type="button" disabled={!uninsuredConsent || busyAction !== null} style={{ ...dangerButton, marginTop: 10, opacity: uninsuredConsent ? 1 : 0.5 }} onClick={() => act({ action: "acknowledge_uninsured", accepted: true }, "acknowledge_uninsured")}>{busyAction === "acknowledge_uninsured" ? "Recording…" : "Proceed uninsured — accept responsibility"}</button>
            </div>
          )}
        </div>

        {!data.submission.submitted && data.submission.blockers.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: "rgba(245,158,11,.08)", border: `1px solid ${V.warn}` }}>
            <strong style={{ color: V.warn, fontSize: 12 }}>Still required before submission</strong>
            <ul style={{ color: V.inkDim, fontSize: 12, lineHeight: 1.5, margin: "7px 0 0 18px" }}>
              {data.submission.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}

        {(actionError || actionBlockers.length > 0) && (
          <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 9, border: `1px solid ${V.danger}`, background: "rgba(220,38,38,.08)" }}>
            {actionError && <strong style={{ color: V.danger, fontSize: 12 }}>{actionError}</strong>}
            {actionBlockers.length > 0 && <ul style={{ color: V.inkDim, fontSize: 12, margin: "7px 0 0 18px" }}>{actionBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          </div>
        )}

        <div style={{ display: "grid", gap: 18, marginTop: 18, opacity: insuranceSatisfied ? 1 : 0.55 }}>
          {WORKFLOW_STAGES.map((stage, stageIndex) => {
            const stageItems = data.items.filter((item) => (stage.phases as readonly string[]).includes(item.phase));
            const stageCompleted = stageItems.filter((item) => item.completed).length;
            const isActive = activeStage === stage.id;
            return (
              <section id={`workflow-${stage.id}`} key={stage.id} style={{ padding: 16, borderRadius: 12, border: `2px solid ${isActive ? V.signal : V.line}`, background: isActive ? "rgba(244,90,30,.05)" : V.surface }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div className="font-mono-ibm" style={{ color: isActive ? V.signal : V.inkFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }}>Stage {stageIndex + 1}{isActive ? " · Current" : ""}</div>
                    <h3 style={{ color: V.ink, fontSize: 18, margin: "3px 0 0" }}>{stage.title}</h3>
                    <p style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>{stage.description}</p>
                  </div>
                  <span style={{ padding: "5px 9px", borderRadius: 20, background: stageCompleted === stageItems.length ? "rgba(22,163,74,.14)" : V.raised, color: stageCompleted === stageItems.length ? V.telemetry : V.inkDim, fontSize: 11, fontWeight: 700 }}>{stageCompleted}/{stageItems.length} complete</span>
                </div>

                {stage.id === "before" && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: V.raised, border: `1px solid ${V.line}` }}>
                    <strong style={{ color: V.ink, fontSize: 12 }}>Site safety preparation</strong>
                    <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>Confirm the PPE and perimeter controls required by the site and approved risk plan.</p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}><a href="/safety-equipment" target="_blank" rel="noreferrer" style={linkStyle}>Safety equipment ↗</a><a href="/shop" target="_blank" rel="noreferrer" style={linkStyle}>DOM Shop ↗</a></div>
                  </div>
                )}

                {stage.phases.map((phase) => (
                  <div key={phase} style={{ marginTop: 14 }}>
                    <h4 style={{ fontSize: 11, textTransform: "uppercase", color: V.inkFaint, letterSpacing: ".08em" }}>{phase}</h4>
                    {stageItems.filter((item) => item.phase === phase).map((item) => (
                      <label key={item.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 0", fontSize: 13, color: item.completed ? V.inkDim : V.ink }}>
                        <input type="checkbox" checked={item.completed} disabled={!insuranceSatisfied || AUTOMATIC_ITEMS.has(item.item_key) || busyAction !== null} onChange={(event) => act({ action: "checklist", itemId: item.id, completed: event.target.checked }, item.id)} />
                        <span style={{ textDecoration: item.completed ? "line-through" : "none" }}>{item.label}{AUTOMATIC_ITEMS.has(item.item_key) && <small style={{ display: "block", color: V.inkFaint, textDecoration: "none" }}>Updates automatically</small>}</span>
                      </label>
                    ))}
                  </div>
                ))}

                {stage.id === "before" && stageCompleted === stageItems.length && !data.job.checked_in_at && <button type="button" style={primaryButton} onClick={() => document.getElementById("workflow-during")?.scrollIntoView({ behavior: "smooth" })}>Preflight complete — continue to flight</button>}

                {stage.id === "during" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    {!data.job.checked_in_at && <ActionButton disabled={!insuranceSatisfied || busyAction !== null} busy={busyAction === "check_in"} onClick={() => act({ action: "check_in" }, "check_in")}>Check in on site</ActionButton>}
                    {data.job.checked_in_at && !data.job.started_at && <ActionButton disabled={!insuranceSatisfied || busyAction !== null} busy={busyAction === "start_flight"} onClick={() => act({ action: "start_flight" }, "start_flight")}>Start flight operations</ActionButton>}
                    {data.job.started_at && !data.job.completed_at && <ActionButton disabled={!insuranceSatisfied || busyAction !== null} busy={busyAction === "field_complete"} onClick={() => act({ action: "field_complete" }, "field_complete")}>Mark field capture complete</ActionButton>}
                    <button type="button" style={dangerButton} onClick={() => setShowIncident((visible) => !visible)}>Report safety incident</button>
                  </div>
                )}

                {stage.id === "after" && (
                  <>
                    <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: V.raised, border: `1px solid ${V.line}` }}>
                      <strong style={{ color: V.ink, fontSize: 12 }}>Mission deliverables</strong>
                      <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>Create these outputs from the captured mission data, then upload the finished client-ready files below.</p>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>{data.deliverablePlan.map((item) => <div key={`${item.type}-${item.label}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span aria-hidden="true" style={{ color: item.uploaded ? V.telemetry : item.required ? V.warn : V.inkFaint }}>{item.uploaded ? "✓" : item.required ? "○" : "△"}</span><div><strong style={{ color: V.ink, fontSize: 12 }}>{item.label}{item.required ? " · required" : " · when scoped"}</strong><div style={{ color: V.inkDim, fontSize: 11, marginTop: 2 }}>{item.guidance}</div></div></div>)}</div>
                    </div>
                    {data.job.completed_at && !data.submission.submitted && <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: `1px solid ${data.submission.ready ? V.telemetry : V.line}`, background: data.submission.ready ? "rgba(22,163,74,.08)" : V.raised }}><strong style={{ fontSize: 13 }}>Final step: submit mission</strong>{!data.submission.ready && <p style={{ color: V.inkDim, fontSize: 11, marginTop: 5 }}>{data.submission.blockers.length} item{data.submission.blockers.length === 1 ? " remains" : "s remain"}. Finish the checklist and upload the required deliverables.</p>}<ActionButton disabled={!data.submission.ready || busyAction !== null} busy={busyAction === "submit_for_qc"} onClick={() => { if (window.confirm("Submit this mission and its deliverables?")) act({ action: "submit_for_qc" }, "submit_for_qc"); }}>Submit completed mission</ActionButton></div>}
                    {data.submission.submitted && <p role="status" style={{ color: V.telemetry, fontSize: 13, marginTop: 14 }}>✓ Mission submitted successfully.</p>}
                  </>
                )}
              </section>
            );
          })}
        </div>

        {showIncident && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <input value={incidentSummary} onChange={(event) => setIncidentSummary(event.target.value)} placeholder="What happened?" style={inputStyle} />
            <textarea value={incidentDetails} onChange={(event) => setIncidentDetails(event.target.value)} placeholder="Details, conditions, and actions taken…" style={{ ...inputStyle, minHeight: 80 }} />
            <button type="button" disabled={!incidentSummary.trim() || busyAction !== null} style={{ ...dangerButton, opacity: incidentSummary.trim() ? 1 : 0.5 }} onClick={() => act({ action: "incident", summary: incidentSummary, details: incidentDetails, severity: "observation" }, "incident")}>{busyAction === "incident" ? "Submitting…" : "Submit safety report"}</button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
          <span style={{ color: V.inkDim, fontSize: 11 }}>{busyAction ? "Saving… please wait before leaving." : "All completed items are saved."}</span>
          <button type="button" disabled={busyAction !== null} onClick={() => router.push("/pilot")} style={{ ...primaryButton, opacity: busyAction ? 0.5 : 1 }}>Save &amp; Return to Missions</button>
        </div>
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
