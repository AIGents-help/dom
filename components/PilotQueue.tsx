"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Pilot > Queue — the open mission marketplace. Combines /api/pilot/queue
// (approved, unclaimed missions anyone verified can request) with the
// caller's own myClaims (missions they've already requested, awaiting admin
// review) into one sortable list, since "sort by status" only means
// something once both states are visible together. Every field shown here
// is the same redacted set the API returns — no contact info, no raw
// address, ever, until admin actually assigns it.

const V = { surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: "none", background: V.signal, color: "#0A0E14", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };

interface QueueArea { lat_grid: number; lng_grid: number }
interface QueueItem {
  id: string; service_type: string | null; status: string; created_at: string;
  scheduled_date: string | null; airspace_class: string | null;
  area?: QueueArea | null; payout_cents?: number | null;
}
type SortKey = "status" | "location" | "payout";

export default function PilotQueue({
  accessToken,
  myClaims,
  onClaimed,
}: {
  accessToken: string;
  myClaims: QueueItem[];
  onClaimed: () => void;
}) {
  const [open, setOpen] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("status");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/pilot/queue", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not load the queue.");
      setOpen([]);
      setLoading(false);
      return;
    }
    const body = await res.json();
    setOpen(body.queue ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(id: string) {
    setClaiming(id);
    setError(null);
    const sb = getSupabaseBrowser();
    const { error: rpcError } = await sb.rpc("pilot_request_mission", { p_mission_request_id: id });
    if (rpcError) {
      setError(rpcError.message);
      setClaiming(null);
      return;
    }
    fetch("/api/notify/mission-claimed", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ missionRequestId: id }),
    }).catch(() => {}); // best-effort — never blocks the claim itself
    await load();
    onClaimed();
    setClaiming(null);
  }

  const combined = [
    ...open.map((m) => ({ ...m, mine: false })),
    ...myClaims.map((m) => ({ ...m, mine: true })),
  ];

  const sorted = [...combined].sort((a, b) => {
    if (sortKey === "status") return a.mine === b.mine ? 0 : a.mine ? 1 : -1;
    if (sortKey === "payout") return (b.payout_cents ?? 0) - (a.payout_cents ?? 0);
    if (sortKey === "location") {
      const la = a.area ? `${a.area.lat_grid},${a.area.lng_grid}` : "";
      const lb = b.area ? `${b.area.lat_grid},${b.area.lng_grid}` : "";
      return la.localeCompare(lb);
    }
    return 0;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: V.inkDim, fontSize: 13 }}>
          Browse open missions and request the ones you want. A request doesn't assign it —
          admin reviews and confirms before it's yours.
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["status", "location", "payout"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className="font-mono-ibm"
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer", textTransform: "uppercase",
                border: `1px solid ${sortKey === k ? V.signal : V.line}`,
                background: sortKey === k ? "rgba(255,138,61,.12)" : "transparent",
                color: sortKey === k ? V.signal : V.inkFaint,
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: V.signal, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: V.inkDim }}>Loading queue…</p>}
      {!loading && sorted.length === 0 && (
        <div style={{ ...panelStyle, textAlign: "center", padding: 40 }}>
          <p style={{ color: V.inkDim }}>No open missions right now.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {sorted.map((m) => (
          <div key={m.id} style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="font-saira" style={{ fontWeight: 600, fontSize: 16 }}>
                  {(m.service_type ?? "").replace(/_/g, " ")}
                </div>
                <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 4 }}>
                  {m.area ? `~${m.area.lat_grid}, ${m.area.lng_grid}` : "Area TBD"} · {m.airspace_class ?? "Airspace TBD"}
                  {m.scheduled_date && ` · ${new Date(m.scheduled_date).toLocaleDateString()}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {m.payout_cents != null && (
                  <div className="font-mono-ibm" style={{ fontSize: 16, color: V.telemetry, fontWeight: 500 }}>
                    ${(m.payout_cents / 100).toFixed(2)}
                  </div>
                )}
                {m.mine ? (
                  <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: "rgba(255,138,61,.12)", color: V.signal, letterSpacing: ".06em", textTransform: "uppercase", display: "inline-block", marginTop: 8 }}>
                    Awaiting review
                  </span>
                ) : (
                  <button onClick={() => claim(m.id)} disabled={claiming === m.id} style={{ ...btnPrimary, marginTop: 8 }}>
                    {claiming === m.id ? "…" : "Request →"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
