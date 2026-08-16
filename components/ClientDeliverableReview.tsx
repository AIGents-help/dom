"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

type Deliverable = { id: string; name: string; type: string | null; qc_passed: boolean; client_status: string; client_feedback?: string | null };

export default function ClientDeliverableReview({ initial }: { initial: Deliverable[] }) {
  const [items, setItems] = useState(initial);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = items.filter((item) => item.qc_passed);
  if (!ready.length) return <p style={{ color: V.inkDim, fontSize: 12 }}>Deliverables will appear after DOM quality review.</p>;

  async function review(id: string, status: "approved" | "revision_requested") {
    setSaving(id); setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const res = await fetch(`/api/client/deliverables/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ status, feedback: feedback[id] ?? "" }) });
    const body = await res.json();
    if (!res.ok) setError(body.error ?? "Review could not be saved");
    else setItems((current) => current.map((item) => item.id === id ? { ...item, client_status: body.status, client_feedback: body.feedback } : item));
    setSaving(null);
  }

  async function download(id: string) {
    setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const res = await fetch(`/api/client/deliverables/${id}/download`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    const body = await res.json();
    if (!res.ok) setError(body.error ?? "File could not be opened");
    else window.open(body.url, "_blank", "noopener,noreferrer");
  }

  return <div style={{ display: "grid", gap: 10 }}>
    {error && <p style={{ color: V.danger, fontSize: 12 }}>{error}</p>}
    {ready.map((item) => <div key={item.id} style={{ padding: 12, border: `1px solid ${V.line}`, borderRadius: 10, background: V.raised }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><strong style={{ fontSize: 13 }}>{item.name}</strong><div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase" }}>{(item.type ?? "deliverable").replace(/_/g, " ")}</div></div><span style={{ color: item.client_status === "approved" ? V.telemetry : item.client_status === "revision_requested" ? V.warn : V.inkDim, fontSize: 11, textTransform: "uppercase" }}>{item.client_status.replace(/_/g, " ")}</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}><button onClick={() => download(item.id)} style={downloadButton}>View / download</button></div>
      {item.client_status !== "approved" && <><textarea value={feedback[item.id] ?? item.client_feedback ?? ""} onChange={(event) => setFeedback((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Optional feedback for approval; required when requesting a revision" style={{ width: "100%", minHeight: 68, marginTop: 10, padding: 9, borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink, resize: "vertical" }} /><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}><button disabled={saving === item.id} onClick={() => review(item.id, "approved")} style={primary}>Approve</button><button disabled={saving === item.id} onClick={() => review(item.id, "revision_requested")} style={ghost}>Request revision</button></div></>}
    </div>)}
  </div>;
}

const primary: React.CSSProperties = { padding: "7px 11px", border: 0, borderRadius: 7, background: V.telemetry, color: V.ground, fontSize: 11, fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { ...primary, background: "transparent", color: V.warn, border: `1px solid ${V.warn}` };
const downloadButton: React.CSSProperties = { ...primary, background: V.signal, color: V.ground };
