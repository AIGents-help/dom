"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PILOT_V as V } from "@/lib/pilotTheme";

interface TeamData {
  viewerRole: "owner" | "field_pilot";
  ownerName: string | null;
  ownerAssignment: null | { status: string; assignedUav: string | null };
  missionPriceCents: number | null;
  currentAssignment: null | {
    id: string;
    status: string;
    payoutCents: number | null;
    pilot: { full_name: string; email: string | null; service_area: string | null } | null;
  };
  eligiblePilots: Array<{ id: string; fullName: string; email: string | null; serviceArea: string | null; equipmentFit: boolean }>;
}

const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 12, background: V.raised, padding: 14, marginBottom: 14 };
const button: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontWeight: 600, cursor: "pointer" };

export default function PilotTeamPanel({ assignmentId, onChanged }: { assignmentId: string; onChanged: () => void }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [selectedPilot, setSelectedPilot] = useState("");
  const [payoutDollars, setPayoutDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const request = useCallback(async (method: "GET" | "POST", payload?: Record<string, unknown>) => {
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) throw new Error("Session expired — reload the page.");
    const response = await fetch(`/api/pilot/missions/${assignmentId}/team`, {
      method,
      headers: { Authorization: `Bearer ${session.session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Team assignment could not be updated.");
    return body;
  }, [assignmentId]);

  const load = useCallback(async () => {
    try { setData(await request("GET")); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Team assignment could not be loaded."); }
  }, [request]);

  useEffect(() => {
    let active = true;
    void request("GET")
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Team assignment could not be loaded.");
      });
    return () => { active = false; };
  }, [request]);

  async function offer() {
    const dollars = Number(payoutDollars);
    if (!selectedPilot || !Number.isFinite(dollars) || dollars < 0) {
      setError("Select a pilot and enter the agreed payout.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await request("POST", { action: "offer", contractorId: selectedPilot, payoutCents: Math.round(dollars * 100) });
      setNotice(result.notificationWarning ?? "The field-pilot offer was sent.");
      await load(); onChanged();
    } catch (offerError) { setError(offerError instanceof Error ? offerError.message : "Offer could not be sent."); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!window.confirm("Approve the field pilot's work and release the deliverables to your client?")) return;
    setBusy(true); setError(null); setNotice(null);
    try { await request("POST", { action: "approve" }); setNotice("Mission approved and delivered to your client."); await load(); onChanged(); }
    catch (approveError) { setError(approveError instanceof Error ? approveError.message : "Mission could not be approved."); }
    finally { setBusy(false); }
  }

  if (!data) return error ? <div style={{ ...panel, borderColor: V.danger, color: V.danger, fontSize: 12 }}>{error}</div> : null;
  if (data.viewerRole !== "owner") {
    return <div style={panel}><strong style={{ fontSize: 13 }}>Field assignment</strong><p style={{ color: V.inkDim, fontSize: 12, marginTop: 5 }}>This mission belongs to another pilot business. Complete the field workflow and submit your deliverables to the mission owner for approval.</p></div>;
  }

  const current = data.currentAssignment;
  return (
    <div style={panel}>
      <div className="font-mono-ibm" style={{ color: V.signal, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>Mission Staffing</div>
      <div style={{ marginTop: 10, padding: 12, borderRadius: 9, border: `1px solid ${V.telemetry}`, background: "rgba(22,163,74,.08)" }}>
        <strong style={{ color: V.telemetry, fontSize: 13 }}>✓ You are assigned as the owner-pilot</strong>
        <p style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>
          {data.ownerName ?? "Mission owner"} · {data.ownerAssignment?.status.replaceAll("_", " ") ?? "accepted"}
          {data.ownerAssignment?.assignedUav ? ` · ${data.ownerAssignment.assignedUav}` : ""}
        </p>
        <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 5 }}>No additional pilot is required. Continue the mission workflow yourself, or optionally invite another pilot for field execution.</p>
      </div>
      {current ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: V.inkDim, fontSize: 11, marginBottom: 6 }}>Additional field pilot</div>
          <strong>{current.pilot?.full_name ?? "Invited pilot"}</strong>
          <div style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>{current.status.replace("_", " ")} · agreed field payout ${((current.payoutCents ?? 0) / 100).toFixed(2)}</div>
          {current.status === "submitted" && <button type="button" onClick={approve} disabled={busy} style={{ ...button, background: V.signal, color: V.ground, borderColor: V.signal, marginTop: 10 }}>{busy ? "Approving…" : "Approve & Deliver to Client"}</button>}
          {current.status !== "submitted" && <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 8 }}>Owner approval unlocks after the field pilot submits the completed mission.</p>}
        </div>
      ) : (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: V.ink, fontSize: 12, fontWeight: 700 }}>Add an additional field pilot (optional)</summary>
          <p style={{ color: V.inkDim, fontSize: 12, marginTop: 7 }}>You retain the client relationship and final approval. An invited pilot handles only field execution and submits the work back to you.</p>
          {data.eligiblePilots.length > 0 ? <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            <select aria-label="Additional field pilot" value={selectedPilot} onChange={(event) => setSelectedPilot(event.target.value)} style={{ padding: 9, borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink }}>
              <option value="">Select an eligible additional pilot…</option>
              {data.eligiblePilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.fullName}{pilot.serviceArea ? ` · ${pilot.serviceArea}` : ""}{pilot.equipmentFit ? " · equipment match" : " · verify equipment"}</option>)}
            </select>
            <label style={{ color: V.inkDim, fontSize: 12 }}>Agreed field payout ($)<input inputMode="decimal" value={payoutDollars} onChange={(event) => setPayoutDollars(event.target.value)} placeholder="0.00" style={{ display: "block", width: "100%", padding: 9, marginTop: 4, borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink }} /></label>
            <p style={{ color: V.inkFaint, fontSize: 11 }}>This records the agreement. Automated payment from the mission owner to the field pilot is not yet enabled.</p>
            <button type="button" onClick={offer} disabled={busy} style={{ ...button, justifySelf: "start" }}>{busy ? "Sending…" : "Offer Field Assignment"}</button>
          </div> : <p style={{ color: V.inkDim, fontSize: 11, marginTop: 8 }}>No additional verified pilots are available right now. You remain assigned and can continue this mission yourself.</p>}
        </details>
      )}
      {error && <p role="alert" style={{ color: V.danger, fontSize: 12, marginTop: 9 }}>{error}</p>}
      {notice && <p role="status" style={{ color: V.telemetry, fontSize: 12, marginTop: 9 }}>{notice}</p>}
    </div>
  );
}
