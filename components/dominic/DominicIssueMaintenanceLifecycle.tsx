"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { issueLifecycleLabel } from "@/lib/dominicIssueLifecycle";

const ORANGE = "#F45A1E";
const PANEL_2 = "#151E27";
const LINE = "#26323D";
const TEXT = "#F4F7FA";
const MUTED = "#8F9CAA";
const GREEN = "#70D6A0";
const AMBER = "#FFB565";
const RED = "#FF7474";

type Issue = {
  id: string;
  status: string;
  metadata: Record<string, unknown>;
  resolution_notes?: string | null;
};

type LifecyclePayload = {
  issue: Issue & {
    resolved_at?: string | null;
    verified_at?: string | null;
  };
  verificationInspection: {
    id: string;
    status: string;
    objective: string | null;
    summary: string | null;
    completed_at: string | null;
    created_at: string;
  } | null;
  verificationFindings: Array<{
    id: string;
    title: string;
    severity: string;
    review_status: string;
  }>;
  assessment: {
    status: string;
    canVerify: boolean;
    shouldReopen: boolean;
    reasons: string[];
  };
};

function assessmentColor(status: string) {
  if (status === "cleared" || status === "improved") return GREEN;
  if (status === "failed") return RED;
  if (status === "needs_review" || status === "capturing") return AMBER;
  return MUTED;
}

export default function DominicIssueMaintenanceLifecycle({
  issue,
  onPlanVerification,
  onChanged,
}: {
  issue: Issue;
  onPlanVerification?: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [lifecycle, setLifecycle] = useState<LifecyclePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [workOrder, setWorkOrder] = useState("");
  const [maintenanceNote, setMaintenanceNote] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your DOMINIC session expired.");

      const response = await fetch(`/api/dominic/issues/${issue.id}/lifecycle`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Issue lifecycle could not be loaded.");
      setLifecycle(body as LifecyclePayload);

      const metadata =
        body?.issue?.metadata && typeof body.issue.metadata === "object"
          ? (body.issue.metadata as Record<string, unknown>)
          : {};
      setWorkOrder(
        typeof metadata.maintenanceWorkOrder === "string"
          ? metadata.maintenanceWorkOrder
          : "",
      );
      setResolutionNotes(
        typeof body?.issue?.resolution_notes === "string"
          ? body.issue.resolution_notes
          : "",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Issue lifecycle could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [issue.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const postAction = async (
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your DOMINIC session expired.");

      const response = await fetch(`/api/dominic/issues/${issue.id}/lifecycle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Issue lifecycle update failed.");
      setLifecycle(body as LifecyclePayload);
      await onChanged?.();
      setMessage(
        action === "start_maintenance"
          ? "Maintenance is now in progress."
          : action === "complete_maintenance"
            ? "Maintenance recorded complete. Post-maintenance verification is now required."
            : action === "verify"
              ? "Post-maintenance evidence verified this issue."
              : action === "verification_failed"
                ? "Verification failed. The issue is back in maintenance in progress."
                : "Issue lifecycle updated.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Issue lifecycle update failed.");
    } finally {
      setBusy(false);
    }
  };

  const currentIssue = lifecycle?.issue ?? issue;
  const lifecycleLabel = issueLifecycleLabel(currentIssue);

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, background: "rgba(244,90,30,.025)" }}>
      <div style={{ padding: "10px 11px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ color: ORANGE, fontSize: 7, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
          Maintenance Closure
        </div>
        <div style={{ color: TEXT, fontSize: 10, fontWeight: 900, marginTop: 3 }}>
          {lifecycleLabel}
        </div>
        <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.45, marginTop: 3 }}>
          Record maintenance, capture a post-maintenance comparison, then verify the issue from evidence.
        </div>
      </div>

      {message ? (
        <div style={{ margin: 9, border: `1px solid ${LINE}`, borderRadius: 7, padding: "7px 8px", color: MUTED, fontSize: 8, background: PANEL_2 }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 11, color: MUTED, fontSize: 8 }}>Loading maintenance lifecycle…</div>
      ) : currentIssue.status === "verified" ? (
        <div style={{ padding: 11, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <ShieldCheck size={17} color={GREEN} />
          <div>
            <div style={{ color: GREEN, fontSize: 9, fontWeight: 900 }}>Maintenance verified</div>
            <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.45, marginTop: 3 }}>
              DOMINIC has a completed post-maintenance evidence comparison and operator verification record for this issue.
            </div>
          </div>
        </div>
      ) : currentIssue.status === "resolved" ? (
        <div style={{ padding: 11, display: "grid", gap: 8 }}>
          {currentIssue.resolution_notes ? (
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL_2, padding: 8 }}>
              <div style={{ color: MUTED, fontSize: 7, fontWeight: 900, textTransform: "uppercase" }}>Maintenance performed</div>
              <div style={{ color: TEXT, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>{currentIssue.resolution_notes}</div>
            </div>
          ) : null}

          {lifecycle?.verificationInspection ? (
            <>
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL_2, padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ color: MUTED, fontSize: 7, fontWeight: 900, textTransform: "uppercase" }}>Verification inspection</div>
                    <div style={{ color: TEXT, fontSize: 9, fontWeight: 900, marginTop: 3 }}>
                      {lifecycle.verificationInspection.objective ?? "Post-maintenance verification"}
                    </div>
                  </div>
                  <span style={{ color: AMBER, fontSize: 7, fontWeight: 900, textTransform: "uppercase" }}>
                    {lifecycle.verificationInspection.status}
                  </span>
                </div>
                <div style={{ color: assessmentColor(lifecycle.assessment.status), fontSize: 8, fontWeight: 900, marginTop: 7, textTransform: "uppercase" }}>
                  DOMINIC comparison · {lifecycle.assessment.status.replaceAll("_", " ")}
                </div>
                <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>
                  {lifecycle.assessment.reasons.join(" ")}
                </div>
              </div>

              <textarea
                value={verificationNotes}
                onChange={(event) => setVerificationNotes(event.target.value)}
                placeholder="Operator verification note — what does the post-maintenance evidence show?"
                rows={3}
                style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void postAction("verify", { verificationNotes })}
                  disabled={busy || !lifecycle.assessment.canVerify}
                  style={{
                    border: `1px solid ${lifecycle.assessment.canVerify ? "rgba(112,214,160,.45)" : LINE}`,
                    background: lifecycle.assessment.canVerify ? "rgba(112,214,160,.10)" : PANEL_2,
                    color: lifecycle.assessment.canVerify ? GREEN : MUTED,
                    borderRadius: 7,
                    padding: "7px 9px",
                    fontSize: 8,
                    fontWeight: 900,
                    cursor: busy || !lifecycle.assessment.canVerify ? "not-allowed" : "pointer",
                  }}
                >
                  <CheckCircle2 size={11} style={{ display: "inline", marginRight: 4 }} />
                  Verify Maintenance
                </button>
                <button
                  type="button"
                  onClick={() => void postAction("verification_failed", { verificationNotes })}
                  disabled={busy}
                  style={{ border: "1px solid rgba(255,116,116,.35)", background: "rgba(255,116,116,.08)", color: RED, borderRadius: 7, padding: "7px 9px", fontSize: 8, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}
                >
                  <RotateCcw size={11} style={{ display: "inline", marginRight: 4 }} />
                  Issue Still Present
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onPlanVerification}
              disabled={busy || !onPlanVerification}
              style={{ border: "1px solid rgba(244,90,30,.42)", background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 7, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: onPlanVerification ? "pointer" : "not-allowed" }}
            >
              <ClipboardCheck size={11} style={{ display: "inline", marginRight: 4 }} />
              Create Verification Inspection
            </button>
          )}
        </div>
      ) : currentIssue.status === "in_progress" ? (
        <div style={{ padding: 11, display: "grid", gap: 7 }}>
          <input
            value={workOrder}
            onChange={(event) => setWorkOrder(event.target.value)}
            placeholder="Work order / maintenance reference (optional)"
            style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }}
          />
          <textarea
            value={resolutionNotes}
            onChange={(event) => setResolutionNotes(event.target.value)}
            placeholder="What was repaired, replaced, adjusted, cleaned, sealed, or otherwise corrected?"
            rows={4}
            style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8, resize: "vertical" }}
          />
          <button
            type="button"
            onClick={() => void postAction("complete_maintenance", { resolutionNotes, workOrder })}
            disabled={busy}
            style={{ border: 0, background: ORANGE, color: "#160901", borderRadius: 7, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}
          >
            Maintenance Complete → Require Verification
          </button>
        </div>
      ) : (
        <div style={{ padding: 11, display: "grid", gap: 7 }}>
          <input
            value={workOrder}
            onChange={(event) => setWorkOrder(event.target.value)}
            placeholder="Work order / maintenance reference (optional)"
            style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }}
          />
          <textarea
            value={maintenanceNote}
            onChange={(event) => setMaintenanceNote(event.target.value)}
            placeholder="Maintenance handoff note (optional)"
            rows={3}
            style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8, resize: "vertical" }}
          />
          <button
            type="button"
            onClick={() => void postAction("start_maintenance", { note: maintenanceNote, workOrder })}
            disabled={busy}
            style={{ border: "1px solid rgba(244,90,30,.42)", background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 7, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}
          >
            <Wrench size={11} style={{ display: "inline", marginRight: 4 }} />
            Start Maintenance
          </button>
        </div>
      )}
    </div>
  );
}
