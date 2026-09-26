"use client";

import { useEffect, useState, useCallback } from "react";
import { PILOT_V as V } from "@/lib/pilotTheme";

const btnGhost: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: `1px solid ${V.line}`, background: V.raised, color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: "1px solid rgba(244,90,30,.78)", background: V.signal, color: "#160A02", fontFamily: "Saira, sans-serif", fontWeight: 800, fontSize: 13, cursor: "pointer" };

// Inline "which equipment am I using" picker for an accepted/in-progress
// mission assignment (issue #15 item 5). Deliberately small/self-contained
// (its own fetch, its own save) so it drops into the existing assignment
// card in app/pilot/page.tsx without that file needing new global state.

interface PickableAsset { id: string; display_name: string | null; manufacturer: string | null; model: string | null; asset_type: string; selected: boolean; registration_number?: string | null; capabilities_verified?: boolean }

export default function MissionAssetPicker({ accessToken, assignmentId, onSaved }: { accessToken: string; assignmentId: string; onSaved?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<PickableAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pilot/missions/${assignmentId}/assets`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load your assets.");
      return;
    }
    setAssets(body.assets ?? []);
    const selected = (body.assets ?? []).filter((a: PickableAsset) => a.selected).map((a: PickableAsset) => a.id);
    setSelectedIds(new Set(selected));
    setSavedCount(selected.length);
  }, [accessToken, assignmentId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function toggle(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/pilot/missions/${assignmentId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ assetIds: [...selectedIds] }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save your equipment selection.");
      return;
    }
    setSavedCount(selectedIds.size);
    setOpen(false);
    await onSaved?.();
  }

  return (
    <div style={{ color: V.ink }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...btnGhost, background: V.raised, color: V.ink }}>
        {savedCount ? `Equipment (${savedCount}) →` : "Assign Equipment →"}
      </button>
      {open && (
        <div style={{ marginTop: 10, padding: 12, border: `1px solid ${V.line}`, borderRadius: 10, background: V.surface, color: V.ink }}>
          {loading && <p style={{ color: V.inkDim, fontSize: 13 }}>Loading your assets…</p>}
          {error && <p style={{ color: V.danger, fontSize: 13 }}>{error}</p>}
          {!loading && assets.length === 0 && !error && (
            <p style={{ color: V.inkFaint, fontSize: 13 }}>No active assets in your inventory yet — add equipment on the Assets tab.</p>
          )}
          {assets.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {assets.map((a) => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggle(a.id)} />
                  {a.display_name || [a.manufacturer, a.model].filter(Boolean).join(" ") || a.asset_type}
                  {a.asset_type === "uav" && <span style={{ color: V.inkDim, fontSize: 11 }}> · {a.registration_number ? "FAA registered" : "registration missing"} · {a.capabilities_verified ? "capabilities verified" : "capabilities pending verification"}</span>}
                </label>
              ))}
            </div>
          )}
          {assets.length > 0 && (
            <button onClick={save} disabled={saving} style={{ ...btnPrimary, padding: "6px 14px", fontSize: 12 }}>
              {saving ? "Saving…" : "Save Selection"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
