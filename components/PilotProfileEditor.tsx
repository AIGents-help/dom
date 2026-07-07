"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Pilot > Profile tab — editable basic info. These columns (full_name,
// phone, service_area, equipment, part107_number) are all outside the
// enforce_contractor_protected_fields trigger's guarded list, so a direct
// RLS-permitted update via contractor_update_own is all that's needed —
// no new API route, same pattern app/admin/contractors/page.tsx's toggle()
// already uses for its own writes.

const V = { ground: "#0A0E14", surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D" };
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
  equipment: string | null;
  rating: number | null;
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
          <Field label="Equipment" value={profile.equipment ?? "Not listed"} />
          <Field label="Rating" value={profile.rating ? `${profile.rating}/5.0` : "No rating yet"} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p style={{ color: "#FF8A3D", fontSize: 13, marginBottom: 12 }}>{error}</p>}
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
          <label style={labelStyle}>Equipment</label>
          <input style={inputStyle} value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={() => setEditing(false)} style={btnGhost} disabled={saving}>Cancel</button>
        <button onClick={save} style={btnPrimary} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 15, marginTop: 4, color: V.ink }}>{value}</div>
    </div>
  );
}
