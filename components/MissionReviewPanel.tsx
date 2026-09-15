"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

type Target = { type: "pilot" | "dom" | "client" | "mission"; label: string; description: string };
type Review = {
  target_type: string;
  overall_rating: number;
  communication_rating: number | null;
  preparedness_rating: number | null;
  accuracy_rating: number | null;
  would_work_again: boolean | null;
  comments: string | null;
  private_notes: string | null;
};

export default function MissionReviewPanel({ endpoint, targets, enabled = true }: { endpoint: string; targets: Target[]; enabled?: boolean }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [active, setActive] = useState(targets[0]?.type ?? "mission");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [overall, setOverall] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [preparedness, setPreparedness] = useState(5);
  const [accuracy, setAccuracy] = useState(5);
  const [again, setAgain] = useState(true);
  const [comments, setComments] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getSupabaseBrowser().auth.getSession();
    if (!data.session) {
      setMessage("Your session expired. Sign in again to review this mission.");
      setMessageIsError(true);
      setLoading(false);
      return;
    }
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error ?? "Reviews could not be loaded.");
      setMessageIsError(true);
    } else {
      setReviews(Object.fromEntries((body.reviews ?? []).map((review: Review) => [review.target_type, review])));
    }
    setLoading(false);
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!targets.some((target) => target.type === active)) setActive(targets[0]?.type ?? "mission");
  }, [active, targets]);
  useEffect(() => {
    const review = reviews[active];
    setOverall(review?.overall_rating ?? 5);
    setCommunication(review?.communication_rating ?? 5);
    setPreparedness(review?.preparedness_rating ?? 5);
    setAccuracy(review?.accuracy_rating ?? 5);
    setAgain(review?.would_work_again ?? true);
    setComments(review?.comments ?? "");
    setPrivateNotes(review?.private_notes ?? "");
  }, [active, reviews]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again to continue.");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          targetType: active,
          overallRating: overall,
          communicationRating: communication,
          preparednessRating: preparedness,
          accuracyRating: accuracy,
          wouldWorkAgain: again,
          comments,
          privateNotes,
        }),
      });
      const output = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(output.error ?? "Could not save review.");
      setMessage("Review saved.");
      await load();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not save review.");
    } finally {
      setSaving(false);
    }
  }

  if (!targets.length) return null;
  const selectedTarget = targets.find((target) => target.type === active) ?? targets[0];
  const existing = reviews[active];

  return (
    <section style={panelStyle}>
      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Reviews</div>
      <p style={{ color: V.inkDim, fontSize: 12, marginTop: 5 }}>Review each part separately. Saved reviews can be updated.</p>
      <div role="tablist" aria-label="Review target" style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
        {targets.map((target) => (
          <button
            key={target.type}
            type="button"
            role="tab"
            aria-selected={active === target.type}
            onClick={() => { setActive(target.type); setMessage(null); }}
            style={{ ...chipStyle, background: active === target.type ? V.signal : "transparent", color: active === target.type ? V.ground : V.ink }}
          >
            {target.label}{reviews[target.type] ? " ✓" : ""}
          </button>
        ))}
      </div>

      <div role="tabpanel" style={{ marginTop: 12 }}>
        <strong style={{ fontSize: 13 }}>{selectedTarget.label}</strong>
        <p style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>{selectedTarget.description}</p>
        {!enabled ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: "rgba(245,158,11,.08)", border: `1px solid ${V.warn}`, color: V.warn, fontSize: 12 }}>
            Complete the field workflow and submit the mission to DOM for QC to unlock reviews.
          </div>
        ) : loading ? (
          <p style={{ color: V.inkDim, fontSize: 12, marginTop: 12 }}>Loading review…</p>
        ) : (
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 9, marginTop: 12 }}>
              <Stars label="Overall" value={overall} set={setOverall} />
              <Stars label="Communication" value={communication} set={setCommunication} />
              <Stars label="Preparedness" value={preparedness} set={setPreparedness} />
              <Stars label="Scope accuracy" value={accuracy} set={setAccuracy} />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginTop: 12 }}>
              <input type="checkbox" checked={again} onChange={(event) => setAgain(event.target.checked)} />
              I would work with this person or company again
            </label>
            <label style={fieldLabel}>Feedback<textarea value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Share useful, professional feedback…" style={textareaStyle} /></label>
            <label style={fieldLabel}>Private DOM note<textarea value={privateNotes} onChange={(event) => setPrivateNotes(event.target.value)} placeholder="Visible only to DOM operations…" style={textareaStyle} /></label>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <button type="submit" disabled={saving} style={{ ...primaryStyle, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : existing ? "Update review" : "Submit review"}</button>
              {message && <span role="status" style={{ color: messageIsError ? V.danger : V.telemetry, fontSize: 12 }}>{message}</span>}
            </div>
          </form>
        )}
        {!enabled && message && <p role="alert" style={{ color: V.danger, fontSize: 12, marginTop: 8 }}>{message}</p>}
      </div>
    </section>
  );
}

function Stars({ label, value, set }: { label: string; value: number; set: (rating: number) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase" }}>{label}</legend>
      <div aria-label={`${label}: ${value} stars`}>
        {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating} star${rating === 1 ? "" : "s"}`} aria-pressed={rating === value} onClick={() => set(rating)} style={{ border: 0, background: "transparent", color: rating <= value ? V.warn : V.inkFaint, fontSize: 22, padding: 2, cursor: "pointer" }}>★</button>)}
      </div>
    </fieldset>
  );
}

const panelStyle: React.CSSProperties = { padding: 16, border: `1px solid ${V.line}`, borderRadius: 12, background: V.raised };
const chipStyle: React.CSSProperties = { padding: "7px 11px", borderRadius: 20, border: `1px solid ${V.line}`, fontSize: 11, cursor: "pointer" };
const fieldLabel: React.CSSProperties = { display: "block", color: V.inkDim, fontSize: 11, marginTop: 10 };
const textareaStyle: React.CSSProperties = { display: "block", width: "100%", minHeight: 65, marginTop: 5, padding: 9, borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink };
const primaryStyle: React.CSSProperties = { marginTop: 10, padding: "8px 13px", borderRadius: 8, border: 0, background: V.signal, color: V.ground, fontWeight: 700, cursor: "pointer" };
