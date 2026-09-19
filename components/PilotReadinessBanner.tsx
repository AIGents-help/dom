"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

interface ReadinessData {
  level: "go" | "caution" | "no_go";
  blockers?: string[];
  cautions?: string[];
  issues?: Array<{ message: string; action: string; target: string }>;
}

export function readinessReasons(data: Pick<ReadinessData, "blockers" | "cautions">) {
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  const cautions = Array.isArray(data.cautions) ? data.cautions : [];
  return [...blockers, ...cautions];
}

export default function PilotReadinessBanner({ assignmentId, onGoToProfile }: { assignmentId: string; onGoToProfile?: () => void }) {
  const [data, setData] = useState<ReadinessData | null>(null);

  const load = useCallback(async () => {
    const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
    if (!sessionData.session) return;
    const response = await fetch(`/api/pilot/missions/${assignmentId}/workflow`, {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    if (!response.ok) return;
    const body = await response.json();
    setData(body.readiness ?? null);
  }, [assignmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!data) return null;

  const color = data.level === "go" ? V.telemetry : data.level === "no_go" ? V.danger : V.warn;
  const reasons = readinessReasons(data);
  const issues = Array.isArray(data.issues) ? data.issues : reasons.map((message) => ({ message, action: "Resolve item", target: "field-workflow" }));

  function goTo(target: string) {
    if (target === "pilot-profile") { onGoToProfile?.(); return; }
    const element = document.getElementById(target);
    const details = element?.closest("details");
    if (details) details.open = true;
    window.setTimeout(() => element?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  return (
    <div
      aria-live="polite"
      style={{
        marginBottom: 12,
        padding: 14,
        borderRadius: 10,
        border: `2px solid ${color}`,
        background: `${color}12`,
      }}
    >
      <strong style={{ color, fontSize: 15 }}>
        {data.level === "go"
          ? "✓ GO — Mission Ready"
          : data.level === "no_go"
            ? "⛔ NO-GO — Resolve Before Departure"
            : "⚠ CAUTION — Pilot Confirmation Required"}
      </strong>
      {issues.map((issue, index) => (
        <div key={`${issue.target}-${issue.message}-${index}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 11, color: V.inkDim, marginTop: 7 }}>
          <span>• {issue.message}</span>
          <button type="button" onClick={() => goTo(issue.target)} style={{ border: 0, padding: 0, background: "transparent", color: V.signal, font: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap" }}>{issue.action} →</button>
        </div>
      ))}
    </div>
  );
}
