"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

interface ReadinessData {
  level: "go" | "caution" | "no_go";
  blockers?: string[];
  cautions?: string[];
}

export function readinessReasons(data: Pick<ReadinessData, "blockers" | "cautions">) {
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  const cautions = Array.isArray(data.cautions) ? data.cautions : [];
  return [...blockers, ...cautions];
}

export default function PilotReadinessBanner({ assignmentId }: { assignmentId: string }) {
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
    load();
  }, [load]);

  if (!data) return null;

  const color = data.level === "go" ? V.telemetry : data.level === "no_go" ? V.danger : V.warn;
  const reasons = readinessReasons(data);

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
      {reasons.map((reason) => (
        <div key={reason} style={{ fontSize: 11, color: V.inkDim, marginTop: 4 }}>
          • {reason}
        </div>
      ))}
    </div>
  );
}
