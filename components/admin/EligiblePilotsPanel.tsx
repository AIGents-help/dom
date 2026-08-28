"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// "Find Eligible Pilots" (issue #15 item 6/9) — derives required
// capabilities from this mission's service_type and lists active,
// verified contractors whose active assets satisfy them, via
// /api/admin/missions/[id]/eligible-pilots. Self-contained so it drops
// into the existing "Offer to Contractor" panel in
// app/admin/missions/[id]/page.tsx without disturbing its own state.

interface EligiblePilot {
  id: string;
  full_name: string;
  email: string | null;
  service_area: string | null;
  part107_verified: boolean;
  insurance_verified: boolean;
  eligibility: { fit: string; missingOptional: string[] };
}

export default function EligiblePilotsPanel({ missionId, onSelect }: { missionId: string; onSelect?: (contractorId: string) => void }) {
  const [pilots, setPilots] = useState<EligiblePilot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) {
      setError("Session expired — reload the page.");
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/missions/${missionId}/eligible-pilots`, {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not find eligible pilots.");
      return;
    }
    setPilots(body.pilots ?? []);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={find}
        disabled={loading}
        style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #D9E0E8", background: "transparent", color: "#172033", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
      >
        {loading ? "Finding…" : "Find Eligible Pilots"}
      </button>
      {error && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 6 }}>{error}</p>}
      {pilots && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {pilots.length === 0 && <p style={{ color: "#8A95A7", fontSize: 12 }}>No active pilot currently has the required equipment for this mission.</p>}
          {pilots.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 7, background: "#F5F7FA", fontSize: 12 }}>
              <span>
                {p.full_name} <span style={{ color: "#8A95A7" }}>{p.service_area ?? "—"}</span>
                {p.eligibility.fit === "partial" && <span style={{ color: "#E5701F" }}> · missing optional: {p.eligibility.missingOptional.join(", ")}</span>}
              </span>
              {onSelect && (
                <button onClick={() => onSelect(p.id)} style={{ border: "none", background: "transparent", color: "#F45A1E", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                  Select →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
