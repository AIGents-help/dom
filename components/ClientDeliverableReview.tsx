"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Download, RotateCcw } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

type Deliverable = {
  id: string;
  name: string;
  type: string | null;
  qc_passed: boolean;
  client_status: string;
  client_feedback?: string | null;
};

const DOMINIC_TYPES = new Set([
  "orthomosaic",
  "dsm",
  "dtm",
  "contours",
  "contours_shapefile",
  "contours_kml",
  "contours_dxf",
  "point_cloud",
  "3d_model",
  "processing_report",
]);

function dominicType(type: string | null) {
  return Boolean(type && DOMINIC_TYPES.has(type));
}

export default function ClientDeliverableReview({ initial }: { initial: Deliverable[] }) {
  const [items, setItems] = useState(initial);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = items.filter((item) => item.qc_passed);
  const approved = ready.filter((item) => item.client_status === "approved");
  const revisions = ready.filter((item) => item.client_status === "revision_requested");
  const pending = ready.filter((item) => !["approved", "revision_requested"].includes(item.client_status));
  const dominicCount = ready.filter((item) => dominicType(item.type)).length;
  const dominicApproved = ready.filter((item) => dominicType(item.type) && item.client_status === "approved").length;
  const dominicRevisions = ready.filter((item) => dominicType(item.type) && item.client_status === "revision_requested").length;

  if (!ready.length) {
    return <p style={{ color: V.inkDim, fontSize: 12 }}>Deliverables will appear after DOM quality review.</p>;
  }

  async function review(id: string, status: "approved" | "revision_requested") {
    setSaving(id);
    setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const res = await fetch(`/api/client/deliverables/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ status, feedback: feedback[id] ?? "" }),
    });
    const body = await res.json();
    if (!res.ok) setError(body.error ?? "Review could not be saved");
    else {
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, client_status: body.status, client_feedback: body.feedback }
            : item
        )
      );
    }
    setSaving(null);
  }

  async function approveRemaining() {
    if (!pending.length) return;
    setBulkSaving(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token ?? "";

    for (const item of pending) {
      const res = await fetch(`/api/client/deliverables/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "approved", feedback: feedback[item.id] ?? "" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Could not approve ${item.name}`);
        setBulkSaving(false);
        return;
      }
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, client_status: body.status, client_feedback: body.feedback }
            : candidate
        )
      );
    }

    setBulkSaving(false);
  }

  async function download(id: string) {
    setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const res = await fetch(`/api/client/deliverables/${id}/download`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    });
    const body = await res.json();
    if (!res.ok) setError(body.error ?? "File could not be opened");
    else window.open(body.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {dominicCount > 0 ? (
        <div
          style={{
            border: "1px solid rgba(244,90,30,.35)",
            borderRadius: 12,
            background: "linear-gradient(135deg, rgba(244,90,30,.10), rgba(9,13,17,.35))",
            padding: 12,
            display: "grid",
            gridTemplateColumns: "60px minmax(0,1fr)",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ width: 60, height: 60, position: "relative", borderRadius: 10, overflow: "hidden" }}>
            <Image src="/brand/dominic-mascot.webp" alt="DOMINIC mascot" fill sizes="60px" style={{ objectFit: "cover" }} />
          </div>
          <div>
            <div style={{ color: V.signal, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
              DOMINIC Mapping Package
            </div>
            <div style={{ color: V.ink, fontSize: 13, fontWeight: 800, marginTop: 2 }}>
              {dominicCount} mapping deliverable{dominicCount === 1 ? "" : "s"} ready for client review
            </div>
            <div style={{ color: V.inkFaint, fontSize: 10, marginTop: 3 }}>
              Intelligent Mapping by DOM · Uniquely Sophisticated
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7, fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <span style={{ color: V.telemetry }}>{dominicApproved} approved</span>
              <span style={{ color: dominicRevisions ? V.warn : V.inkFaint }}>{dominicRevisions} revision</span>
              <span style={{ color: V.inkDim }}>{Math.max(0, dominicCount - dominicApproved - dominicRevisions)} awaiting review</span>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        <Summary label="Ready" value={ready.length} />
        <Summary label="Approved" value={approved.length} tone={V.telemetry} />
        <Summary label="Revision" value={revisions.length} tone={V.warn} />
      </div>

      {pending.length > 1 ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button disabled={bulkSaving} onClick={approveRemaining} style={bulkApprove}>
            <CheckCircle2 size={13} /> {bulkSaving ? "Approving…" : `Approve remaining ${pending.length}`}
          </button>
        </div>
      ) : null}

      {error && <p style={{ color: V.danger, fontSize: 12 }}>{error}</p>}

      {ready.map((item) => (
        <div key={item.id} style={{ padding: 12, border: `1px solid ${V.line}`, borderRadius: 10, background: V.raised }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{item.name}</strong>
              <div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase" }}>
                {(item.type ?? "deliverable").replace(/_/g, " ")}
                {dominicType(item.type) ? " · DOMINIC" : ""}
              </div>
            </div>
            <span
              style={{
                color:
                  item.client_status === "approved"
                    ? V.telemetry
                    : item.client_status === "revision_requested"
                      ? V.warn
                      : V.inkDim,
                fontSize: 11,
                textTransform: "uppercase",
              }}
            >
              {item.client_status.replace(/_/g, " ")}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            <button onClick={() => download(item.id)} style={downloadButton}>
              <Download size={12} /> View / download
            </button>
          </div>

          {item.client_status !== "approved" ? (
            <>
              <textarea
                value={feedback[item.id] ?? item.client_feedback ?? ""}
                onChange={(event) =>
                  setFeedback((current) => ({ ...current, [item.id]: event.target.value }))
                }
                placeholder="Optional approval note. For a revision, describe exactly what should change."
                style={{
                  width: "100%",
                  minHeight: 68,
                  marginTop: 10,
                  padding: 9,
                  borderRadius: 8,
                  border: `1px solid ${V.line}`,
                  background: V.surface,
                  color: V.ink,
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button disabled={saving === item.id} onClick={() => review(item.id, "approved")} style={primary}>
                  <CheckCircle2 size={12} /> Approve
                </button>
                <button
                  disabled={saving === item.id || !(feedback[item.id] ?? item.client_feedback ?? "").trim()}
                  title={!(feedback[item.id] ?? item.client_feedback ?? "").trim() ? "Enter revision instructions first" : "Send revision instructions to the pilot"}
                  onClick={() => review(item.id, "revision_requested")}
                  style={{ ...ghost, opacity: !(feedback[item.id] ?? item.client_feedback ?? "").trim() ? .5 : 1 }}
                >
                  <RotateCcw size={12} /> Request revision
                </button>
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Summary({ label, value, tone = V.ink }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ padding: 9, borderRadius: 9, border: `1px solid ${V.line}`, background: V.surface }}>
      <div style={{ fontSize: 16, fontWeight: 850, color: tone }}>{value}</div>
      <div style={{ color: V.inkFaint, fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    </div>
  );
}

const primary: React.CSSProperties = {
  padding: "7px 11px",
  border: 0,
  borderRadius: 7,
  background: V.telemetry,
  color: V.ground,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};
const ghost: React.CSSProperties = {
  ...primary,
  background: "transparent",
  color: V.warn,
  border: `1px solid ${V.warn}`,
};
const downloadButton: React.CSSProperties = {
  ...primary,
  background: V.signal,
  color: V.ground,
};
const bulkApprove: React.CSSProperties = {
  ...primary,
  background: "transparent",
  color: V.telemetry,
  border: `1px solid ${V.telemetry}`,
};
