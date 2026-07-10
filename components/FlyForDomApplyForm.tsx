"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { CERT_TIMELINE_CONFIG, type CertTimelineBucket } from "@/lib/certTimeline";

// The actual signup mechanics for /fly-for-dom, split out from the page so
// the page itself can be a server-rendered marketing page around it.
//
// Two paths, branching on whether a Part 107 # is entered:
// - Already certified: apply, then straight into Stripe Express onboarding
//   so payouts are set up from the start (unchanged from before).
// - Not certified yet: pick a timeline bucket instead of a cert #, land in
//   the resource library on a computed deadline. No Stripe onboarding yet
//   — there's nothing to get paid for until they're verified, and forcing
//   Connect's identity flow on someone who's still studying is just
//   friction that would hurt signup conversion for the exact people this
//   tier exists to capture.
export default function FlyForDomApplyForm() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    part107_number: "",
    service_area: "",
    equipment: "",
  });
  const [certTimelineBucket, setCertTimelineBucket] = useState<CertTimelineBucket | "">("");
  const [part107TestDate, setPart107TestDate] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const alreadyCertified = form.part107_number.trim().length > 0;

  async function submit() {
    if (!alreadyCertified && !certTimelineBucket) {
      setStatus("error");
      setError("Let us know your Part 107 exam timeline, or enter a certificate number if you're already licensed.");
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: `${window.location.origin}/pilot/login` },
      });
      if (signUpError) throw new Error(signUpError.message);

      if (signUpData.user?.identities && signUpData.user.identities.length === 0) {
        throw new Error("This email is already registered. Try signing in at /pilot/login instead, or use a different email.");
      }

      const applyRes = await fetch("/api/contractors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          authUserId: signUpData.user?.id,
          cert_timeline_bucket: alreadyCertified ? null : certTimelineBucket,
          part107_test_date: !alreadyCertified && certTimelineBucket === "has_test_date" ? part107TestDate : null,
        }),
      });
      const apply = await applyRes.json();
      if (!applyRes.ok) throw new Error(apply.error ?? "Application failed.");

      if (!alreadyCertified) {
        window.location.href = "/pilot";
        return;
      }

      const onbRes = await fetch("/api/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: apply.contractorId }),
      });
      const onb = await onbRes.json();
      if (!onbRes.ok) throw new Error(onb.error ?? "Could not start payout setup.");

      window.location.href = onb.url;
    } catch (e: any) {
      setStatus("error");
      setError(e.message);
    }
  }

  return (
    <div style={card}>
      <p style={eyebrow}>◆ Apply Now</p>
      <h2 style={h2}>Set up your pilot account.</h2>
      <p style={sub}>
        Already Part 107 certified? Apply and set up payouts below. Still working toward it?
        Sign up anyway — you'll get resource library access while you study.
      </p>

      <Field label="Full name" v={form.full_name} on={(v) => set("full_name", v)} />
      <Field label="Email" v={form.email} on={(v) => set("email", v)} type="email" />
      <Field label="Password" v={form.password} on={(v) => set("password", v)} type="password" />
      <Field label="Phone" v={form.phone} on={(v) => set("phone", v)} />
      <Field label="Part 107 certificate # (leave blank if not certified yet)" v={form.part107_number} on={(v) => set("part107_number", v)} />

      {!alreadyCertified && (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: "#8A95A7" }}>When do you expect to pass your Part 107 exam?</label>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {(Object.keys(CERT_TIMELINE_CONFIG) as CertTimelineBucket[]).map((bucket) => (
              <label
                key={bucket}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                  border: `1px solid ${certTimelineBucket === bucket ? "#FF8A3D" : "#232C3B"}`,
                  background: certTimelineBucket === bucket ? "rgba(255,138,61,.08)" : "#0A0E14",
                  fontSize: 13, cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="cert_timeline_bucket"
                  checked={certTimelineBucket === bucket}
                  onChange={() => setCertTimelineBucket(bucket)}
                />
                {CERT_TIMELINE_CONFIG[bucket].label}
              </label>
            ))}
          </div>
          {certTimelineBucket === "has_test_date" && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12, color: "#8A95A7" }}>Test date</label>
              <input type="date" value={part107TestDate} onChange={(e) => setPart107TestDate(e.target.value)} style={input} />
            </div>
          )}
        </div>
      )}

      <Field label="Service area (city / radius)" v={form.service_area} on={(v) => set("service_area", v)} />
      <Field label="Aircraft & sensors you own" v={form.equipment} on={(v) => set("equipment", v)} />

      {error && <p style={{ color: "#FF8A3D", fontSize: 13, marginTop: 12 }}>{error}</p>}

      <button onClick={submit} disabled={status === "submitting"} style={btn}>
        {status === "submitting" ? "Setting up…" : alreadyCertified ? "Apply & set up payouts →" : "Start studying →"}
      </button>
      <p style={{ color: "#5A6678", fontSize: 12, marginTop: 14 }}>
        {alreadyCertified
          ? "Payout setup is handled securely by Stripe. DOM verifies Part 107 and insurance before any paid assignment."
          : "No certificate needed to sign up — we'll email you before your free access window closes."}
      </p>
    </div>
  );
}

function Field({ label, v, on, type = "text" }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <label style={{ fontSize: 12, color: "#8A95A7" }}>{label}</label>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} style={input} />
    </div>
  );
}

const card: React.CSSProperties = { width: "100%", maxWidth: 460, margin: "0 auto", padding: 34, border: "1px solid #232C3B", borderRadius: 16, background: "#11161F", color: "#E8ECF2" };
const eyebrow: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: "#FF8A3D" };
const h2: React.CSSProperties = { fontFamily: "Saira, sans-serif", fontSize: 24, fontWeight: 700, marginTop: 10, lineHeight: 1.1 };
const sub: React.CSSProperties = { color: "#8A95A7", fontSize: 14, marginTop: 12, marginBottom: 8 };
const input: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: "1px solid #232C3B", background: "#0A0E14", color: "#E8ECF2", fontSize: 14, outline: "none" };
const btn: React.CSSProperties = { width: "100%", marginTop: 22, padding: 13, borderRadius: 10, border: "none", background: "#FF8A3D", color: "#0A0E14", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" };
