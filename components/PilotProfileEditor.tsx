"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

// Pilot > Profile tab — editable basic info. These columns (full_name,
// phone, service_area, equipment, part107_number, home_address) are all outside the
// enforce_contractor_protected_fields trigger's guarded list, so a direct
// RLS-permitted update via contractor_update_own is all that's needed —
// no new API route, same pattern app/admin/contractors/page.tsx's toggle()
// already uses for its own writes.

const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: V.inkFaint, letterSpacing: ".1em", textTransform: "uppercase" };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  part107_number: string | null;
  service_area: string | null;
  home_address: string | null;
  equipment: string | null;
  rating: number | null;
  insurance_verified: boolean;
  insurance_requested: boolean;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_expires_on: string | null;
  insurance_liability_cents: number | null;
  insurance_coi_path: string | null;
  dom_gig_insurance_eligible: boolean;
}

export default function PilotProfileEditor({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    part107_number: profile.part107_number ?? "",
    service_area: profile.service_area ?? "",
    home_address: profile.home_address ?? "",
    equipment: profile.equipment ?? "",
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: updateError } = await sb
        .from("contractors")
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          part107_number: form.part107_number.trim() || null,
          service_area: form.service_area.trim() || null,
          home_address: form.home_address.trim() || null,
          equipment: form.equipment.trim() || null,
        })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={() => setEditing(true)} style={btnGhost}>Edit profile</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Full Name" value={profile.full_name} />
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone ?? "Not provided"} />
          <Field label="Part 107 #" value={profile.part107_number ?? "Not provided"} />
          <Field label="Service Area" value={profile.service_area ?? "Not set"} />
          <Field label="Home / Dispatch Address (Private)" value={profile.home_address ?? "Not set"} />
          <Field label="Equipment" value={profile.equipment ?? "Not listed"} />
          <Field label="Rating" value={profile.rating ? `${profile.rating}/5.0` : "No rating yet"} />
        </div>
        <InsurancePanel profile={profile} onSaved={onSaved} />
      </div>
    );
  }

  return (
    <div>
      {error && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Part 107 #</label>
          <input style={inputStyle} value={form.part107_number} onChange={(e) => setForm({ ...form, part107_number: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Service Area</label>
          <input style={inputStyle} value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Home / Dispatch Address — Private</label>
          <input
            style={inputStyle}
            value={form.home_address}
            onChange={(e) => setForm({ ...form, home_address: e.target.value })}
            placeholder="123 Main St, City, State ZIP"
            autoComplete="street-address"
          />
          <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 5 }}>
            Used as your default starting point for mission travel estimates. It is visible only to you and DOM admins and never appears on your public profile.
          </p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Equipment</label>
          <input style={inputStyle} value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={() => setEditing(false)} style={btnGhost} disabled={saving}>Cancel</button>
        <button onClick={save} style={btnPrimary} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      <InsurancePanel profile={profile} onSaved={onSaved} />
    </div>
  );
}

function InsurancePanel({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [provider, setProvider] = useState(profile.insurance_provider ?? "SkyWatch.AI");
  const [policyNumber, setPolicyNumber] = useState(profile.insurance_policy_number ?? "");
  const [expiresOn, setExpiresOn] = useState(profile.insurance_expires_on ?? "");
  const [liability, setLiability] = useState(profile.insurance_liability_cents ? String(profile.insurance_liability_cents / 100) : "1000000");
  const [coi, setCoi] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const expired = !!profile.insurance_expires_on && new Date(`${profile.insurance_expires_on}T23:59:59`).getTime() <= Date.now();
  async function submit() { setSaving(true); setMessage(null); const sb = getSupabaseBrowser(); const { data } = await sb.auth.getSession(); const body = new FormData(); body.set("provider", provider); body.set("policyNumber", policyNumber); body.set("expiresOn", expiresOn); body.set("liabilityDollars", liability); if (coi) body.set("coi", coi); const res = await fetch("/api/pilot/insurance/profile", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body }); const out = await res.json(); setMessage(res.ok ? out.message : out.error); setSaving(false); if (res.ok) onSaved(); }
  return <section style={{ marginTop: 22, padding: 16, borderRadius: 12, border: `1px solid ${profile.insurance_verified && !expired ? V.telemetry : V.warn}`, background: profile.insurance_verified && !expired ? "rgba(22,163,74,.06)" : "rgba(245,158,11,.06)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><div style={labelStyle}>Insurance verification</div><strong style={{ color: profile.insurance_verified && !expired ? V.telemetry : V.warn }}>{profile.insurance_verified && !expired ? "Verified and current" : profile.insurance_requested ? "Pending DOM review" : "Not verified"}</strong></div>{profile.dom_gig_insurance_eligible && <span style={{ color: V.telemetry, fontSize: 11, fontWeight: 700 }}>DOM GIG PROGRAM ELIGIBLE</span>}</div>
    <p style={{ color: V.inkDim, fontSize: 12, marginTop: 7 }}>Upload a current certificate of insurance. DOM verifies the policy; pilots cannot self-approve coverage.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 12 }}><input style={inputStyle} placeholder="Insurance provider" value={provider} onChange={e => setProvider(e.target.value)} /><input style={inputStyle} placeholder="Policy number" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} /><input style={inputStyle} type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} /><input style={inputStyle} type="number" min="1" placeholder="Liability limit ($)" value={liability} onChange={e => setLiability(e.target.value)} /></div>
    <label style={{ ...btnGhost, display: "inline-block", marginTop: 10, fontSize: 12 }}>Choose COI (PDF/JPG/PNG)<input type="file" accept=".pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={e => setCoi(e.target.files?.[0] ?? null)} /></label>{coi && <span style={{ color: V.inkDim, fontSize: 11, marginLeft: 8 }}>{coi.name}</span>}
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}><button onClick={submit} disabled={saving || !provider || !policyNumber || !expiresOn || !liability} style={btnPrimary}>{saving ? "Submitting…" : "Submit for verification"}</button><a href="https://www.skywatch.ai/drone-insurance" target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 12, fontWeight: 700 }}>Get coverage from SkyWatch.AI ↗</a></div>
    {message && <p style={{ color: message.includes("submitted") ? V.telemetry : V.danger, fontSize: 12, marginTop: 8 }}>{message}</p>}
    <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 9 }}>If DOM assigns the job and you are approved for the DOM gig-insurance program, DOM may bind job-specific coverage. Eligibility alone does not unlock a mission.</p>
  </section>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 15, marginTop: 4, color: V.ink }}>{value}</div>
    </div>
  );
}
