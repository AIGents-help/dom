"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { CAPABILITIES, CAPABILITY_LABELS } from "@/lib/pilotAssetsPipeline";

// Admin pilot equipment/capability search (issue #15 item 6) — a
// self-contained panel dropped into app/admin/contractors/page.tsx above
// the existing unfiltered list, rather than reworking that page's own
// state. Answers "show pilots with a Matrice 4E" / "show active pilots
// with thermal in this service area" / "show pilots capable of RTK
// mapping" against /api/admin/pilot-assets/search.

interface MatchingAsset { id: string; asset_type: string; manufacturer: string | null; model: string | null; display_name: string | null; status: string; archived: boolean; capabilities: string[] }
interface PilotResult { id: string; full_name: string; email: string | null; service_area: string | null; status: string; part107_verified: boolean; insurance_verified: boolean; matching_assets: MatchingAsset[] }

const rowCard: React.CSSProperties = { border: "1px solid #D9E0E8", borderRadius: 12, background: "#FFFFFF", padding: 14 };

export default function PilotAssetSearchPanel() {
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [capability, setCapability] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [part107Only, setPart107Only] = useState(false);
  const [insuranceOnly, setInsuranceOnly] = useState(false);
  const [results, setResults] = useState<PilotResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    const supabaseBrowser = getSupabaseBrowser();
    const { data: session } = await supabaseBrowser.auth.getSession();
    if (!session.session) {
      setError("Session expired — reload the page.");
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (manufacturer) params.set("manufacturer", manufacturer);
    if (model) params.set("model", model);
    if (capability) params.set("capability", capability);
    if (serviceArea) params.set("service_area", serviceArea);
    if (part107Only) params.set("part107_verified", "true");
    if (insuranceOnly) params.set("insurance_verified", "true");

    const res = await fetch(`/api/admin/pilot-assets/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Search failed.");
      return;
    }
    setResults(body.pilots ?? []);
  }

  const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 7, border: "1px solid #D9E0E8", fontSize: 13, minWidth: 140 };

  return (
    <div style={{ ...rowCard, marginBottom: 18 }}>
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: ".1em", color: "#8A95A7", textTransform: "uppercase", marginBottom: 10 }}>
        Pilot Equipment Search
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input placeholder="Manufacturer (e.g. DJI)" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} style={inputStyle} />
        <input placeholder="Model (e.g. Matrice 4E)" value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} />
        <select value={capability} onChange={(e) => setCapability(e.target.value)} style={inputStyle}>
          <option value="">Any capability</option>
          {CAPABILITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input placeholder="Service area" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: 12, color: "#5F6B7A", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={part107Only} onChange={(e) => setPart107Only(e.target.checked)} /> Part 107 verified
        </label>
        <label style={{ fontSize: 12, color: "#5F6B7A", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={insuranceOnly} onChange={(e) => setInsuranceOnly(e.target.checked)} /> Insurance verified
        </label>
        <button
          onClick={search}
          disabled={loading}
          style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: "#F45A1E", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>}

      {results && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {results.length === 0 && <p style={{ color: "#8A95A7", fontSize: 13 }}>No pilots match those filters.</p>}
          {results.map((p) => (
            <div key={p.id} style={{ padding: 10, borderRadius: 8, border: "1px solid #E8EDF2" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name} <span style={{ color: "#8A95A7", fontWeight: 400, fontSize: 12 }}>{p.email} · {p.service_area ?? "—"}</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {p.matching_assets.map((a) => (
                  <span key={a.id} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#F5F7FA", color: "#5F6B7A" }}>
                    {a.display_name || [a.manufacturer, a.model].filter(Boolean).join(" ") || a.asset_type}
                    {a.capabilities.length > 0 && ` — ${a.capabilities.map((c) => CAPABILITY_LABELS[c] ?? c).join(", ")}`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
