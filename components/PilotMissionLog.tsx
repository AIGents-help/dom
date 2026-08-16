"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";
import { googleMapsPlaceUrl } from "@/lib/googleMaps";
import { assessMissionEquipment, missionEquipmentGuidance, missionWeatherUrl } from "@/lib/missionEquipmentGuidance";
import PilotFieldWorkflow from "@/components/PilotFieldWorkflow";
import MissionReviewPanel from "@/components/MissionReviewPanel";

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
interface ForecastResult { available: boolean; reason?: string; location?: string; rating?: "favorable" | "caution" | "unfavorable"; summary?: string; forecast?: { highF: number; lowF: number; precipitationProbability: number; maxWindMph: number; maxGustMph: number }; source?: string; }

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
  onGoToProfile,
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
  onGoToProfile: () => void;
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
  const equipmentAssessments = assessMissionEquipment(serviceType, profileEquipment);
  const compatibleAircraft = equipmentAssessments.filter((item) => item.compatible);
  const [aircraft, setAircraft] = useState(assignedUav ?? "");
  const selectedAssessment = equipmentAssessments.find((item) => item.aircraft === aircraft);
  const guidance = aircraft ? missionEquipmentGuidance(serviceType, aircraft) : [];
  const forecastDaysAway = performanceDate ? Math.ceil((new Date(performanceDate).getTime() - Date.now()) / 86_400_000) : null;
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

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

  useEffect(() => {
    if (!performanceDate || !missionLocation) { setForecast(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setForecastLoading(true);
      try {
        const date = performanceDate.slice(0, 10);
        const res = await fetch(`/api/weather/mission?location=${encodeURIComponent(missionLocation)}&date=${date}`, { signal: controller.signal });
        setForecast(await res.json());
      } catch (weatherError) {
        if ((weatherError as Error).name !== "AbortError") setForecast({ available: false, reason: "Forecast could not be loaded." });
      } finally { setForecastLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [performanceDate, missionLocation]);

  const forfeitMission = useCallback(async () => {
    if (!window.confirm("Return this mission to DOM because no compatible aircraft is available?")) return;
    setError(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const res = await fetch(`/api/pilot/missions/${assignmentId}/respond`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ action: "decline" }) });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "DOM could not be notified"); return; }
    onSaved(); onClose();
  }, [assignmentId, onClose, onSaved]);

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
          <PilotFieldWorkflow assignmentId={assignmentId} />
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
                {performanceDate && <div aria-live="polite" style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${forecast?.rating === "unfavorable" ? V.danger : forecast?.rating === "caution" ? V.warn : forecast?.available ? V.telemetry : V.line}`, background: forecast?.rating === "unfavorable" ? "rgba(220,38,38,.08)" : forecast?.rating === "caution" ? "rgba(245,158,11,.08)" : forecast?.available ? "rgba(22,163,74,.08)" : V.raised }}>
                  {forecastLoading ? <span style={{ color: V.inkDim, fontSize: 11 }}>Checking forecast…</span> : <>{forecast?.available ? <><strong style={{ color: forecast.rating === "unfavorable" ? V.danger : forecast.rating === "caution" ? V.warn : V.telemetry, fontSize: 12 }}>{forecast.rating === "unfavorable" ? "⚠ Consider reassignment" : forecast.rating === "caution" ? "△ Weather caution" : "✓ Forecast looks favorable"}</strong><div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>{forecast.summary}</div><div style={{ color: V.ink, fontSize: 11, marginTop: 5 }}>{forecast.forecast?.lowF}–{forecast.forecast?.highF}°F · Rain {forecast.forecast?.precipitationProbability}% · Wind {forecast.forecast?.maxWindMph} mph · Gusts {forecast.forecast?.maxGustMph} mph</div>{forecast.rating === "unfavorable" && <button type="button" onClick={() => setPerformanceDate("")} style={{ ...btnGhost, padding: "5px 9px", fontSize: 11, marginTop: 7 }}>Clear date and choose another</button>}</> : <span style={{ color: V.warn, fontSize: 11 }}>{forecast?.reason}</span>}<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, paddingTop: 7, borderTop: `1px solid ${V.line}` }}><a href={missionWeatherUrl(missionLocation, new Date(performanceDate).toISOString())} target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 11, fontWeight: 700 }}>View full forecast range ↗</a><a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 11, fontWeight: 700 }}>Aviation Weather Center ↗</a>{forecastDaysAway != null && forecastDaysAway > 10 && <span style={{ color: V.warn, fontSize: 10 }}>Long-range outlook—recheck inside 7–10 days.</span>}</div></>}
                </div>}
              </div>
              <div>
                <label style={{ color: V.inkDim, fontSize: 12 }}>Pilot operational notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access instructions, site contact coordination, equipment plan, weather considerations…" style={{ ...inputStyle, marginTop: 6, minHeight: 90, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: V.raised, border: `1px solid ${V.line}` }}>
              <div className="font-saira" style={{ fontSize: 14, fontWeight: 700 }}>Assigned UAV & Mission Settings</div>
              {compatibleAircraft.length ? (
                <>
                  <label style={{ color: V.inkDim, fontSize: 12, display: "block", marginTop: 10 }}>Compatible aircraft from your Pilot Profile</label>
                  <select value={aircraft} onChange={(e) => setAircraft(e.target.value)} style={{ ...inputStyle, marginTop: 6, maxWidth: 420 }}>
                    <option value="">Select an aircraft…</option>
                    {compatibleAircraft.map((item) => <option key={item.aircraft} value={item.aircraft}>{item.aircraft}</option>)}
                  </select>
                  {aircraft && selectedAssessment?.compatible && <div aria-live="polite" style={{ marginTop: 9, padding: 10, borderRadius: 8, border: `1px solid ${V.telemetry}`, background: "rgba(22,163,74,.08)" }}><strong style={{ color: V.telemetry, fontSize: 12 }}>✓ Equipment confirmed for this mission</strong><div style={{ color: V.inkDim, fontSize: 11, marginTop: 3 }}>{selectedAssessment.reason} Final go/no-go remains subject to payload configuration, site conditions, and manufacturer limits.</div></div>}
                </>
              ) : (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 9, border: `1px solid ${V.danger}`, background: "rgba(220,38,38,.08)" }}><strong style={{ color: V.danger, fontSize: 12 }}>No compatible aircraft found</strong><p style={{ color: V.inkDim, fontSize: 11, marginTop: 5 }}>Update Pilot Profile → Equipment with the exact manufacturer and model if you own a suitable unit. Otherwise, return this mission to DOM so it can be reassigned.</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}><button type="button" onClick={onGoToProfile} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11 }}>Update equipment profile</button><button type="button" onClick={forfeitMission} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11, borderColor: V.danger, color: V.danger }}>Forfeit / reassign mission</button></div></div>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 14 }}>
              <MissionTextarea label="Site access & arrival" value={accessNotes} onChange={setAccessNotes} placeholder="Parking, gate codes, check-in, escorts, property access…" />
              <MissionTextarea label="Cautions & awareness" value={cautions} onChange={setCautions} placeholder="People, animals, utilities, obstacles, sensitive areas, weather or airspace concerns…" />
              <div style={{ gridColumn: "1 / -1" }}>
                <MissionTextarea label="Client communications & coordination" value={communications} onChange={setCommunications} placeholder="Log calls, emails, confirmations, changes requested, and follow-up commitments with dates…" />
              </div>
            </div>
            <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 9 }}>Client scope, location, and pricing remain locked to the DOM-approved mission.</p>
            <button onClick={saveOperations} disabled={savingOperations || !selectedAssessment?.compatible || !["accepted", "in_progress", "submitted"].includes(assignmentStatus)} style={{ ...btnPrimary, marginTop: 12, opacity: selectedAssessment?.compatible && ["accepted", "in_progress", "submitted"].includes(assignmentStatus) ? 1 : .5 }}>
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
                      {!d.qc_passed && <span style={{ color: V.inkFaint, fontSize: 11 }}>Awaiting DOM review</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <UploadRow onUpload={uploadDeliverable} categories={["orthomosaic", "3d_model", "point_cloud", "report", "raw_images", "video", "other"]} />
          </div>
          <MissionReviewPanel endpoint={`/api/pilot/missions/${assignmentId}/reviews`} enabled={["submitted","qc_passed","paid"].includes(assignmentStatus)} targets={[{type:"client",label:"Review Client",description:"Rate client communication, site readiness, access coordination, and professionalism."},{type:"mission",label:"Review the Gig",description:"Rate scope accuracy, site conditions, workload, pricing fairness, and whether you would accept similar work again."}]} />
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
