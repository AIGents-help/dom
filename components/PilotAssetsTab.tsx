"use client";

import { useEffect, useState, useCallback } from "react";
import { V, panelStyle, btnPrimary, btnGhost, inputStyle, labelStyle, statusPillStyle } from "@/lib/theme";
import { ASSET_TYPES, ASSET_STATUS_OPTIONS, CAPABILITIES, CAPABILITY_LABELS, isAssetActive } from "@/lib/pilotAssetsPipeline";

// Pilot > Assets — structured equipment inventory (issue #15). Private
// fields (serial/registration/Remote ID/firmware/acquired date/notes) are
// clearly marked and only ever leave this tab's own API route
// (app/api/pilot/assets/**, scoped to the calling pilot via
// resolveContractor()) — public_visible only ever surfaces
// display_name/manufacturer/model/public_description/status/capabilities,
// enforced server-side in lib/pilotAssetsPipeline.ts's toPublicAsset(), not
// just hidden in this UI.

interface Asset {
  id: string;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  display_name: string | null;
  serial_number: string | null;
  registration_number: string | null;
  remote_id: string | null;
  firmware_version: string | null;
  acquired_at: string | null;
  status: string;
  public_visible: boolean;
  public_description: string | null;
  notes: string | null;
  archived_at: string | null;
  capabilities: string[];
}

const EMPTY_FORM = {
  asset_type: "uav",
  manufacturer: "",
  model: "",
  display_name: "",
  serial_number: "",
  registration_number: "",
  remote_id: "",
  firmware_version: "",
  acquired_at: "",
  status: "active",
  public_visible: false,
  public_description: "",
  notes: "",
  capabilities: [] as string[],
};
type FormState = typeof EMPTY_FORM;

export default function PilotAssetsTab({ accessToken }: { accessToken: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/pilot/assets", { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not load your assets.");
      setLoading(false);
      return;
    }
    setAssets(body.assets ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(a: Asset) {
    setForm({
      asset_type: a.asset_type,
      manufacturer: a.manufacturer ?? "",
      model: a.model ?? "",
      display_name: a.display_name ?? "",
      serial_number: a.serial_number ?? "",
      registration_number: a.registration_number ?? "",
      remote_id: a.remote_id ?? "",
      firmware_version: a.firmware_version ?? "",
      acquired_at: a.acquired_at ?? "",
      status: a.status,
      public_visible: a.public_visible,
      public_description: a.public_description ?? "",
      notes: a.notes ?? "",
      capabilities: a.capabilities,
    });
    setEditingId(a.id);
  }

  function toggleCapability(cap: string) {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(cap) ? f.capabilities.filter((c) => c !== cap) : [...f.capabilities, cap],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload = { ...form, acquired_at: form.acquired_at || null };
    const isNew = editingId === "new";
    const res = await fetch(isNew ? "/api/pilot/assets" : `/api/pilot/assets/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save this asset.");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function setArchived(id: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/pilot/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update this asset.");
      return;
    }
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this asset permanently? This can't be undone.")) return;
    setError(null);
    const res = await fetch(`/api/pilot/assets/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove this asset.");
      return;
    }
    await load();
  }

  const visible = assets.filter((a) => (showArchived ? !!a.archived_at : !a.archived_at));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: V.inkDim, fontSize: 13, maxWidth: 520 }}>
          Your equipment inventory. DOM uses each asset's capabilities to match you to eligible missions in the Queue —
          identifiers and notes marked <strong>Private</strong> are never shown publicly, even if this asset's public toggle is on.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowArchived((s) => !s)} style={btnGhost}>{showArchived ? "Show active" : "Show archived"}</button>
          <button onClick={startCreate} style={btnPrimary}>+ Add Asset</button>
        </div>
      </div>

      {error && <p style={{ color: V.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: V.inkDim }}>Loading your assets…</p>}

      {editingId && (
        <AssetForm
          form={form}
          setForm={setForm}
          toggleCapability={toggleCapability}
          onCancel={() => setEditingId(null)}
          onSave={save}
          saving={saving}
          isNew={editingId === "new"}
        />
      )}

      {!loading && visible.length === 0 && (
        <div style={{ ...panelStyle, textAlign: "center", padding: 32 }}>
          <p style={{ color: V.inkDim }}>{showArchived ? "No archived assets." : "No assets yet — add your first piece of equipment."}</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: editingId ? 14 : 0 }}>
        {visible.map((a) => {
          const typeLabel = ASSET_TYPES.find((t) => t.value === a.asset_type)?.label ?? a.asset_type;
          const statusColor = a.status === "active" ? V.telemetry : a.status === "maintenance" ? V.warn : a.status === "retired" ? V.inkFaint : V.danger;
          return (
            <div key={a.id} style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="font-saira" style={{ fontWeight: 600, fontSize: 16 }}>
                    {a.display_name || [a.manufacturer, a.model].filter(Boolean).join(" ") || typeLabel}
                  </div>
                  <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>
                    {typeLabel}
                    {isAssetActive(a) ? "" : " · inactive for eligibility"}
                  </div>
                  {a.capabilities.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {a.capabilities.map((c) => (
                        <span key={c} className="font-mono-ibm" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: V.lineSoft, color: V.inkDim }}>
                          {CAPABILITY_LABELS[c] ?? c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className="font-mono-ibm" style={statusPillStyle(statusColor)}>
                    {ASSET_STATUS_OPTIONS.find((s) => s.value === a.status)?.label ?? a.status}
                  </span>
                  <span style={{ fontSize: 11, color: a.public_visible ? V.telemetry : V.inkFaint }}>
                    {a.public_visible ? "Public profile: ON" : "Public profile: OFF"}
                  </span>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {!a.archived_at && <button onClick={() => startEdit(a)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>Edit</button>}
                    {a.archived_at ? (
                      <button onClick={() => setArchived(a.id, false)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>Unarchive</button>
                    ) : (
                      <button onClick={() => setArchived(a.id, true)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>Archive</button>
                    )}
                    <button onClick={() => remove(a.id)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, color: V.danger, borderColor: V.danger }}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetForm({
  form, setForm, toggleCapability, onCancel, onSave, saving, isNew,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  toggleCapability: (c: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div style={{ ...panelStyle, marginBottom: 4 }}>
      <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".08em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 12 }}>
        {isNew ? "Add Asset" : "Edit Asset"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Asset type</label>
          <select value={form.asset_type} onChange={(e) => set("asset_type", e.target.value)} style={inputStyle}>
            {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} style={inputStyle}>
            {ASSET_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Public display name</label>
          <input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} style={inputStyle} placeholder="e.g. DJI Matrice 4E" />
        </div>
        <div>
          <label style={labelStyle}>Manufacturer</label>
          <input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Model</label>
          <input value={form.model} onChange={(e) => set("model", e.target.value)} style={inputStyle} />
        </div>
      </div>

      <label style={labelStyle}>Capabilities</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {CAPABILITIES.map((c) => {
          const active = form.capabilities.includes(c.value);
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => toggleCapability(c.value)}
              className="font-mono-ibm"
              style={{
                fontSize: 11, padding: "6px 10px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${active ? V.signal : V.line}`,
                background: active ? "rgba(244,90,30,.12)" : "transparent",
                color: active ? V.signal : V.inkDim,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderRadius: 10, background: V.ground, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: form.public_visible ? 10 : 0 }}>
          <input type="checkbox" checked={form.public_visible} onChange={(e) => set("public_visible", e.target.checked)} />
          <span style={{ fontSize: 13, color: V.ink, fontWeight: 600 }}>Show on my public profile</span>
        </label>
        {form.public_visible && (
          <div>
            <label style={labelStyle}>Public description</label>
            <textarea value={form.public_description} onChange={(e) => set("public_description", e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="A short, customer-facing description of this equipment." />
            <p style={{ fontSize: 11, color: V.inkFaint, marginTop: 6 }}>
              Only display name, manufacturer, model, this description, status, and capabilities are ever shown publicly — never the private fields below.
            </p>
          </div>
        )}
      </div>

      <div className="font-mono-ibm" style={{ fontSize: 11, letterSpacing: ".06em", color: V.inkFaint, textTransform: "uppercase", marginBottom: 10 }}>
        Private — visible only to you and DOM admins
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Serial number</label>
          <input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>FAA registration number</label>
          <input value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Remote ID</label>
          <input value={form.remote_id} onChange={(e) => set("remote_id", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Firmware / software version</label>
          <input value={form.firmware_version} onChange={(e) => set("firmware_version", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Acquisition date</label>
          <input type="date" value={form.acquired_at} onChange={(e) => set("acquired_at", e.target.value)} style={inputStyle} />
        </div>
      </div>
      <label style={labelStyle}>Notes</label>
      <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ ...inputStyle, minHeight: 60, marginBottom: 16 }} />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : isNew ? "Add Asset" : "Save Changes"}</button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}
