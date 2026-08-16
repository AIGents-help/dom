"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";
import { googleMapsPlaceUrl } from "@/lib/googleMaps";
import { equipmentChoices, missionEquipmentGuidance, missionWeatherUrl } from "@/lib/missionEquipmentGuidance";

// Pilot > Mission Log — per-assignment documents + deliverables, mirroring
// the admin Mission Briefing / Deliverables panels but driven by the
// pilot's own RLS access (pilot manages assigned mission docs /
// pilot manages own job deliverables policies). Works identically whether
// the mission was admin-offered or pilot-self-created — access is the
// same RLS check either way, so there's nothing to special-case here.

const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 13, outline: "none" };

interface DocRow { id: string; category: string; name: string; file_url: string | null; is_required: boolean; is_completed: boolean; }
interface DeliverableRow { id: string; name: string; type: string | null; storage_url: string | null; qc_passed: boolean | null; }

export default function PilotMissionLog({
  assignmentId,
  assignmentStatus,
  jobId,
  missionRequestId,
  missionTitle,
  missionLocation,
  serviceType,
  clientName,
  clientEmail,
  clientCompany,
  clientRequests,
  airspaceClass,
  scheduledFor,
  operationalNotes,
  siteAccessNotes,
  cautionsAwareness,
  clientCommunications,
  assignedUav,
  profileEquipment,
  deliveryResponsibility,
  onClose,
  onSaved,
}: {
  assignmentId: string;
  assignmentStatus: string;
  jobId: string;
  missionRequestId: string;
  missionTitle: string;
  missionLocation: string;
  serviceType: string;
  clientName: string | null;
  clientEmail: string | null;
  clientCompany: string | null;
  clientRequests: string | null;
  airspaceClass: string | null;
  scheduledFor: string | null;
  operationalNotes: string | null;
  siteAccessNotes: string | null;
  cautionsAwareness: string | null;
  clientCommunications: string | null;
  assignedUav: string | null;
  profileEquipment: string | null;
  deliveryResponsibility: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingOperations, setSavingOperations] = useState(false);
  const [performanceDate, setPerformanceDate] = useState(scheduledFor ? new Date(scheduledFor).toISOString().slice(0, 16) : "");
  const [notes, setNotes] = useState(operationalNotes ?? "");
  const [accessNotes, setAccessNotes] = useState(siteAccessNotes ?? "");
  const [cautions, setCautions] = useState(cautionsAwareness ?? "");
  const [communications, setCommunications] = useState(clientCommunications ?? "");
  const aircraftChoices = equipmentChoices(profileEquipment);
  const [aircraft, setAircraft] = useState(assignedUav ?? "");
  const guidance = aircraft ? missionEquipmentGuidance(serviceType, aircraft) : [];
  const forecastDaysAway = performanceDate ? Math.ceil((new Date(performanceDate).getTime() - Date.now()) / 86_400_000) : null;

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

  const saveOperations = useCallback(async () => {
    setSavingOperations(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Not authenticated");
      const res = await fetch(`/api/pilot/missions/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          scheduledFor: performanceDate ? new Date(performanceDate).toISOString() : null,
          operationalNotes: notes,
          siteAccessNotes: accessNotes,
          cautionsAwareness: cautions,
          clientCommunications: communications,
          assignedUav: aircraft,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not update mission");
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Could not update mission");
    } finally {
      setSavingOperations(false);
    }
  }, [assignmentId, performanceDate, notes, accessNotes, cautions, communications, aircraft, onSaved]);

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
        <div style={{ ...panelStyle, borderColor: "#DC2626" }}>
          <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: V.inkDim, fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <div style={{ ...panelStyle, borderColor: V.signal }}>
            <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Mission Operations</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ color: V.inkDim, fontSize: 13 }}>{missionLocation}</div>
              <a href={googleMapsPlaceUrl(missionLocation)} target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 12, fontWeight: 600 }}>Open site in Google Maps ↗</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
              <Detail label="Mission type" value={serviceType.replace(/_/g, " ")} />
              <Detail label="Client" value={clientCompany || clientName || "Not provided"} />
              <Detail label="Airspace" value={airspaceClass ? `Class ${airspaceClass}` : "Verify before flight"} />
            </div>
            <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: V.raised, border: `1px solid ${V.line}` }}>
              <div style={{ color: V.inkFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>Client requests / approved scope</div>
              <div style={{ color: V.ink, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 6 }}>{clientRequests || "No additional client requests were recorded."}</div>
              {clientEmail && <a href={`mailto:${clientEmail}`} style={{ color: V.signal, fontSize: 12, display: "inline-block", marginTop: 8 }}>Email {clientName || "client"} ↗</a>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) 1fr", gap: 14, marginTop: 14 }}>
              <div>
                <label style={{ color: V.inkDim, fontSize: 12 }}>Scheduled performance date and time</label>
                <input type="datetime-local" value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
              </div>
              <div>
                <label style={{ color: V.inkDim, fontSize: 12 }}>Pilot operational notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access instructions, site contact coordination, equipment plan, weather considerations…" style={{ ...inputStyle, marginTop: 6, minHeight: 90, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: V.raised, border: `1px solid ${V.line}` }}>
              <div className="font-saira" style={{ fontSize: 14, fontWeight: 700 }}>Assigned UAV & Mission Settings</div>
              {aircraftChoices.length ? (
                <>
                  <label style={{ color: V.inkDim, fontSize: 12, display: "block", marginTop: 10 }}>Aircraft assigned to this mission</label>
                  <select value={aircraft} onChange={(e) => setAircraft(e.target.value)} style={{ ...inputStyle, marginTop: 6, maxWidth: 420 }}>
                    <option value="">Select an aircraft…</option>
                    {aircraftChoices.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </>
              ) : (
                <p style={{ color: V.warn, fontSize: 12, marginTop: 8 }}>No aircraft are listed in your Pilot Profile. Add your UAVs under Profile → Equipment, separated by commas or separate lines.</p>
              )}
              {guidance.length > 0 && (
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {guidance.map((section) => (
                    <div key={section.title} style={{ padding: 12, borderRadius: 8, background: V.surface, border: `1px solid ${V.line}` }}>
                      <div style={{ color: V.signal, fontSize: 12, fontWeight: 700 }}>{section.title}</div>
                      <ul style={{ margin: "8px 0 0 18px", color: V.inkDim, fontSize: 12, lineHeight: 1.55 }}>
                        {section.items.map((item) => <li key={item} style={{ marginTop: 4 }}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14, padding: 12, borderRadius: 9, border: `1px solid ${V.line}`, background: "rgba(14,165,233,.05)" }}>
              <a href={missionWeatherUrl(missionLocation, performanceDate ? new Date(performanceDate).toISOString() : scheduledFor)} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>Weather forecast for mission date ↗</a>
              <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 12, fontWeight: 600 }}>Aviation Weather Center ↗</a>
              {!performanceDate && <span style={{ color: V.warn, fontSize: 11 }}>Schedule the mission to target the forecast date.</span>}
              {forecastDaysAway != null && forecastDaysAway > 10 && <span style={{ color: V.warn, fontSize: 11 }}>Long-range outlook only—recheck inside 7–10 days and again before flight.</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 14 }}>
              <MissionTextarea label="Site access & arrival" value={accessNotes} onChange={setAccessNotes} placeholder="Parking, gate codes, check-in, escorts, property access…" />
              <MissionTextarea label="Cautions & awareness" value={cautions} onChange={setCautions} placeholder="People, animals, utilities, obstacles, sensitive areas, weather or airspace concerns…" />
              <div style={{ gridColumn: "1 / -1" }}>
                <MissionTextarea label="Client communications & coordination" value={communications} onChange={setCommunications} placeholder="Log calls, emails, confirmations, changes requested, and follow-up commitments with dates…" />
              </div>
            </div>
            <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 9 }}>Client scope, location, and pricing remain locked to the DOM-approved mission.</p>
            <button onClick={saveOperations} disabled={savingOperations || !["accepted", "in_progress", "submitted"].includes(assignmentStatus)} style={{ ...btnPrimary, marginTop: 12, opacity: ["accepted", "in_progress", "submitted"].includes(assignmentStatus) ? 1 : .5 }}>
              {savingOperations ? "Saving…" : "Save Mission Updates"}
            </button>
          </div>

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
                      <span className="font-mono-ibm" style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase", background: d.qc_passed ? "rgba(22,163,74,.2)" : "rgba(229,112,31,.14)", color: d.qc_passed ? V.telemetry : V.warn }}>
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

function Detail({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 10, borderRadius: 8, background: V.raised }}><div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div><div style={{ color: V.ink, fontSize: 13, marginTop: 4, textTransform: label === "Mission type" ? "capitalize" : "none" }}>{value}</div></div>;
}

function MissionTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label style={{ color: V.inkDim, fontSize: 12 }}>{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, marginTop: 6, minHeight: 90, resize: "vertical" }} /></div>;
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
