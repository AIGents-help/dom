"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Pilot > Mission Log — per-assignment documents + deliverables, mirroring
// the admin Mission Briefing / Deliverables panels but driven by the
// pilot's own RLS access (pilot manages assigned mission docs /
// pilot manages own job deliverables policies). Works identically whether
// the mission was admin-offered or pilot-self-created — access is the
// same RLS check either way, so there's nothing to special-case here.

const V = { ground: "#0A0E14", surface: "#11161F", raised: "#161D29", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 13, outline: "none" };

interface DocRow { id: string; category: string; name: string; file_url: string | null; is_required: boolean; is_completed: boolean; }
interface DeliverableRow { id: string; name: string; type: string | null; storage_url: string | null; qc_passed: boolean | null; }

export default function PilotMissionLog({
  jobId,
  missionRequestId,
  missionTitle,
  deliveryResponsibility,
  onClose,
}: {
  jobId: string;
  missionRequestId: string;
  missionTitle: string;
  deliveryResponsibility: string;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [{ data: d }, { data: del }] = await Promise.all([
      sb.from("mission_documents").select("id, category, name, file_url, is_required, is_completed").eq("mission_request_id", missionRequestId).order("sort_order"),
      sb.from("deliverables").select("id, name, type, storage_url, qc_passed").eq("job_id", jobId).order("created_at"),
    ]);
    setDocs((d as DocRow[]) ?? []);
    setDeliverables((del as DeliverableRow[]) ?? []);
    setLoading(false);
  }, [jobId, missionRequestId]);

  useEffect(() => { load(); }, [load]);

  const uploadDoc = useCallback(async (name: string, category: string, file: File) => {
    setError(null);
    const sb = getSupabaseBrowser();
    const path = `${missionRequestId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await sb.storage.from("mission-documents").upload(path, file);
    if (uploadError) { setError(uploadError.message); return; }
    const { error: insErr } = await sb.from("mission_documents").insert({ mission_request_id: missionRequestId, name, category, file_url: path, is_required: false });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [missionRequestId, load]);

  const downloadDoc = useCallback(async (path: string) => {
    const sb = getSupabaseBrowser();
    const { data } = await sb.storage.from("mission-documents").createSignedUrl(path, 300);
    if (data) window.open(data.signedUrl, "_blank");
  }, []);

  const uploadDeliverable = useCallback(async (name: string, type: string, file: File) => {
    setError(null);
    const sb = getSupabaseBrowser();
    const path = `${jobId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await sb.storage.from("mission-deliverables").upload(path, file);
    if (uploadError) { setError(uploadError.message); return; }
    const { error: insErr } = await sb.from("deliverables").insert({ job_id: jobId, name, type, storage_url: path });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [jobId, load]);

  const downloadDeliverable = useCallback(async (path: string) => {
    const sb = getSupabaseBrowser();
    const { data } = await sb.storage.from("mission-deliverables").createSignedUrl(path, 300);
    if (data) window.open(data.signedUrl, "_blank");
  }, []);

  const markQcPassed = useCallback(async (id: string) => {
    const sb = getSupabaseBrowser();
    await sb.from("deliverables").update({ qc_passed: true, delivered_at: new Date().toISOString() }).eq("id", id);
    await load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="font-saira" style={{ fontSize: 18, fontWeight: 700 }}>Mission Log — {missionTitle}</div>
          <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 4 }}>
            Delivery handled by: {deliveryResponsibility === "pilot" ? "you" : "DOM admin"} — but documents and
            deliverables here are always shared between you and admin.
          </p>
        </div>
        <button onClick={onClose} style={btnGhost}>← Back to Missions</button>
      </div>

      {error && (
        <div style={{ ...panelStyle, borderColor: "#FF8A3D" }}>
          <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: V.inkDim, fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <div style={panelStyle}>
            <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Documents</div>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {docs.length === 0 && <p style={{ color: V.inkDim, fontSize: 13 }}>No documents yet.</p>}
              {docs.map((d) => (
                <div key={d.id} style={{ ...panelStyle, padding: 12, background: V.raised }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                      <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{d.category.replace(/_/g, " ")}{d.is_required ? " · required" : ""}</span>
                    </div>
                    {d.file_url && (
                      <button onClick={() => downloadDoc(d.file_url!)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>Download</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <UploadRow onUpload={uploadDoc} categories={["authorization", "permit", "waiver", "insurance", "site_access", "client_contract", "laanc", "notam", "safety", "equipment", "reference", "other"]} />
          </div>

          <div style={panelStyle}>
            <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Deliverables</div>
            <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 6 }}>Only QC-passed deliverables are visible to the client.</p>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {deliverables.length === 0 && <p style={{ color: V.inkDim, fontSize: 13 }}>No deliverables uploaded yet.</p>}
              {deliverables.map((d) => (
                <div key={d.id} style={{ ...panelStyle, padding: 12, background: V.raised }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                      <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{(d.type ?? "").replace(/_/g, " ")}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="font-mono-ibm" style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase", background: d.qc_passed ? "rgba(79,209,197,.2)" : "rgba(255,138,61,.14)", color: d.qc_passed ? V.telemetry : V.signal }}>
                        {d.qc_passed ? "QC passed" : "pending QC"}
                      </span>
                      {d.storage_url && <button onClick={() => downloadDeliverable(d.storage_url!)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>Download</button>}
                      {!d.qc_passed && <button onClick={() => markQcPassed(d.id)} style={{ ...btnPrimary, padding: "5px 10px", fontSize: 12 }}>Mark QC Passed</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <UploadRow onUpload={uploadDeliverable} categories={["orthomosaic", "3d_model", "point_cloud", "report", "raw_images", "video", "other"]} />
          </div>
        </>
      )}
    </div>
  );
}

function UploadRow({ onUpload, categories }: { onUpload: (name: string, category: string, file: File) => void; categories: string[] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 180 }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, width: 160 }}>
        {categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
      </select>
      <label style={{ ...btnGhost, display: "inline-block", fontSize: 12 }}>
        Choose file & upload
        <input
          type="file"
          style={{ display: "none" }}
          disabled={!name.trim()}
          onChange={(e) => { const f = e.target.files?.[0]; if (f && name.trim()) { onUpload(name.trim(), category, f); setName(""); } }}
        />
      </label>
    </div>
  );
}
