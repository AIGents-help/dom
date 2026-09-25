"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";
import { googleMapsPlaceUrl } from "@/lib/googleMaps";
import { assessMissionEquipment, missionEquipmentGuidance, missionWeatherUrl } from "@/lib/missionEquipmentGuidance";
import { useNow } from "@/lib/useNow";
import PilotFieldWorkflow from "@/components/PilotFieldWorkflow";
import PilotReadinessBanner from "@/components/PilotReadinessBanner";
import PilotTeamPanel from "@/components/PilotTeamPanel";
import MissionReviewPanel from "@/components/MissionReviewPanel";
import { DELIVERABLE_TYPES, DOCUMENT_CATEGORIES, type PilotFileKind } from "@/lib/pilotMissionFiles";
import { deliverablePlanFor } from "@/lib/missionWorkflow";

// Pilot > Mission Log — per-assignment documents + deliverables, mirroring
// the admin Mission Briefing / Deliverables panels but driven by the
// pilot's own RLS access (pilot manages assigned mission docs /
// pilot manages own job deliverables policies). Pilot-owned missions use
// owner certification; DOM-assigned missions retain DOM QC.

const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 13, outline: "none" };
const SERVICE_TYPES = [
  ["roof_inspection_residential", "Roof Inspection (Residential)"],
  ["roof_inspection_commercial", "Roof Inspection (Commercial)"],
  ["construction_progress", "Construction Progress Mapping"],
  ["thermal_inspection", "Thermal + Visual Inspection"],
  ["ortho_survey", "Orthomosaic Survey"],
  ["powerline_inspection", "Powerline / Utility Inspection"],
  ["real_estate_media", "Real Estate / General Aerial Images"],
  ["aerial_images", "Aerial Images"],
  ["custom", "Custom Mission"],
] as const;

interface DocRow { id: string; category: string; name: string; file_url: string | null; download_url: string | null; is_required: boolean; is_completed: boolean; }
interface DeliverableRow { id: string; name: string; type: string | null; storage_url: string | null; download_url: string | null; qc_passed: boolean | null; }
interface ForecastResult { available: boolean; reason?: string; location?: string; rating?: "favorable" | "caution" | "unfavorable"; summary?: string; forecast?: { highF: number; lowF: number; precipitationProbability: number; maxWindMph: number; maxGustMph: number }; source?: string; }

export default function PilotMissionLog({
  assignmentId,
  assignmentStatus,
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
  const now = useNow();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);
  const [savingOperations, setSavingOperations] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState(false);
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [missionName, setMissionName] = useState(missionTitle);
  const [missionServiceType, setMissionServiceType] = useState(serviceType);
  const [missionScope, setMissionScope] = useState(clientRequests ?? "");
  const [returningMission, setReturningMission] = useState(false);
  const [performanceDate, setPerformanceDate] = useState(scheduledFor ? new Date(scheduledFor).toISOString().slice(0, 16) : "");
  const [notes, setNotes] = useState(operationalNotes ?? "");
  const [accessNotes, setAccessNotes] = useState(siteAccessNotes ?? "");
  const [cautions, setCautions] = useState(cautionsAwareness ?? "");
  const [communications, setCommunications] = useState(clientCommunications ?? "");
  const equipmentAssessments = assessMissionEquipment(missionServiceType, profileEquipment);
  const compatibleAircraft = equipmentAssessments.filter((item) => item.compatible);
  const [aircraft, setAircraft] = useState(assignedUav ?? "");
  const selectedAssessment = equipmentAssessments.find((item) => item.aircraft === aircraft);
  const guidance = aircraft ? missionEquipmentGuidance(missionServiceType, aircraft) : [];
  const captureDeliverables = deliverablePlanFor(missionServiceType);
  const forecastDaysAway = performanceDate ? Math.ceil((new Date(performanceDate).getTime() - now) / 86_400_000) : null;
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const canReturnMission = ["accepted", "scheduled"].includes(assignmentStatus);
  const pilotOwned = deliveryResponsibility === "pilot";

  const load = useCallback(async () => {
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again to continue.");
      const response = await fetch(`/api/pilot/missions/${assignmentId}/files`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Mission files could not be loaded.");
      setDocs(body.documents ?? []);
      setDeliverables(body.deliverables ?? []);
      setCanUpload(!!body.canUpload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mission files could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!performanceDate || !missionLocation) { setForecast(null); return; }
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
    setReturningMission(true);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again to continue.");
      const res = await fetch(`/api/pilot/missions/${assignmentId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: "return", reason: "No compatible aircraft available." }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "DOM could not be notified.");
      onSaved();
      onClose();
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : "DOM could not be notified.");
    } finally {
      setReturningMission(false);
    }
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
      setWorkflowRefreshKey((key) => key + 1);
      setNotice("Mission settings saved. Premission readiness has been refreshed from the saved mission record.");
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Could not update mission");
    } finally {
      setSavingOperations(false);
    }
  }, [assignmentId, performanceDate, notes, accessNotes, cautions, communications, aircraft, onSaved]);

  const saveMissionDefinition = useCallback(async () => {
    if (!missionName.trim()) { setError("Enter a mission name."); return; }
    setSavingDefinition(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again to continue.");
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
          missionDefinition: { title: missionName, serviceType: missionServiceType, scope: missionScope },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not update the mission definition.");
      setMissionName(body.missionDefinition?.title ?? missionName.trim());
      setMissionServiceType(body.missionDefinition?.serviceType ?? missionServiceType);
      setMissionScope(body.missionDefinition?.scope ?? missionScope.trim());
      setEditingDefinition(false);
      setNotice("Mission name, type, and scope updated. Mapper will use the new details.");
      setWorkflowRefreshKey((key) => key + 1);
      onSaved();
    } catch (definitionError) {
      setError(definitionError instanceof Error ? definitionError.message : "Could not update the mission definition.");
    } finally {
      setSavingDefinition(false);
    }
  }, [aircraft, assignmentId, accessNotes, cautions, communications, missionName, missionScope, missionServiceType, notes, onSaved, performanceDate]);

  const uploadFile = useCallback(async (kind: PilotFileKind, name: string, category: string, file: File) => {
    setError(null);
    setNotice(null);
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error("Your session expired. Sign in again to continue.");
    const common = { kind, name, category, fileName: file.name, fileSize: file.size, contentType: file.type || "application/octet-stream" };
    const prepareResponse = await fetch(`/api/pilot/missions/${assignmentId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ action: "prepare_upload", ...common }),
    });
    const prepared = await prepareResponse.json().catch(() => ({}));
    if (!prepareResponse.ok) throw new Error(prepared.error ?? "Upload could not be prepared.");
    const { error: uploadError } = await sb.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) throw new Error(uploadError.message);
    const completeResponse = await fetch(`/api/pilot/missions/${assignmentId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ action: "complete_upload", path: prepared.path, ...common }),
    });
    const completed = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) throw new Error(completed.error ?? "Upload could not be added to the mission.");
    await load();
    setWorkflowRefreshKey((key) => key + 1);
    setNotice(`${kind === "document" ? "Document" : "Deliverable"} uploaded.`);
  }, [assignmentId, load]);

  const uploadDoc = useCallback((name: string, category: string, file: File) => uploadFile("document", name, category, file), [uploadFile]);
  const uploadDeliverable = useCallback((name: string, category: string, file: File) => uploadFile("deliverable", name, category, file), [uploadFile]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 7, color: V.inkFaint, fontSize: 12 }}>
        <span>Pilot Portal</span><span aria-hidden="true">/</span>
        <button type="button" onClick={onClose} style={{ border: 0, padding: 0, background: "transparent", color: V.signal, cursor: "pointer", font: "inherit" }}>Missions</button>
        <span aria-hidden="true">/</span><span aria-current="page" style={{ color: V.inkDim }}>{missionName}</span>
      </nav>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="font-saira" style={{ fontSize: 18, fontWeight: 700 }}>Mission Log — {missionName}</div>
          <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 4 }}>
            Delivery handled by: {pilotOwned ? "your pilot business" : "DOM admin"}. {pilotOwned ? "You own client approval and final delivery; DOM hosts the workflow." : "DOM reviews and approves the final deliverables."}
          </p>
        </div>
        <button onClick={onClose} style={btnGhost}>← Back to Missions</button>
      </div>

      {error && (
        <div style={{ ...panelStyle, borderColor: "#DC2626" }}>
          <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>
        </div>
      )}
      {notice && <div role="status" style={{ ...panelStyle, padding: 12, borderColor: V.telemetry, color: V.telemetry, fontSize: 13 }}>{notice}</div>}

      {loading ? (
        <p style={{ color: V.inkDim, fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {pilotOwned && <PilotTeamPanel assignmentId={assignmentId} onChanged={() => { setWorkflowRefreshKey((key) => key + 1); onSaved(); }} />}
          <PilotReadinessBanner key={`readiness-${workflowRefreshKey}`} assignmentId={assignmentId} onGoToProfile={onGoToProfile} />
          <PilotFieldWorkflow assignmentId={assignmentId} refreshKey={workflowRefreshKey} onChanged={onSaved} />
          <section id="mission-capture-plan" style={{ ...panelStyle, borderColor: V.signal }}>
            <style>{`@media print { body * { visibility: hidden !important; } #mission-capture-plan, #mission-capture-plan * { visibility: visible !important; } #mission-capture-plan { position: absolute; inset: 0; width: 100%; border: 0 !important; background: white !important; color: black !important; } #mission-capture-plan button { display: none !important; } }`}</style>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Mission Capture Plan</div>
                <h3 style={{ color: V.ink, fontSize: 18, marginTop: 5 }}>{missionName}</h3>
                <p style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>Use this job-specific plan in the field and print or save it as a PDF when needed.</p>
              </div>
              <button type="button" onClick={() => window.print()} style={btnGhost}>Print / Save PDF</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
              <Detail label="Mission type" value={missionServiceType.replace(/_/g, " ")} />
              <Detail label="Aircraft" value={aircraft || "Select before flight"} />
              <Detail label="Performance date" value={performanceDate ? new Date(performanceDate).toLocaleString() : "Not scheduled"} />
              <Detail label="Airspace" value={airspaceClass ? `Class ${airspaceClass}` : "Verify before flight"} />
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <CapturePlanRow label="Site" value={missionLocation} />
              <CapturePlanRow label="Approved scope" value={missionScope || "No additional scope recorded."} />
              <CapturePlanRow label="Site access" value={accessNotes || "Confirm access, parking, check-in, and site contact before arrival."} />
              <CapturePlanRow label="Hazards and cautions" value={cautions || "Complete the site walk and record hazards before flight."} />
              <CapturePlanRow label="Flight and capture notes" value={notes || "Follow the approved scope, maintain coverage overlap, and verify image quality before leaving."} />
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${V.line}` }}>
              <strong style={{ color: V.ink, fontSize: 12 }}>Required capture outputs</strong>
              <ul style={{ color: V.inkDim, fontSize: 12, lineHeight: 1.55, margin: "7px 0 0 18px" }}>{captureDeliverables.map((item) => <li key={`${item.type}-${item.label}`}><strong>{item.label}</strong>{item.required ? " — required. " : " — when included in scope. "}{item.guidance}</li>)}</ul>
            </div>
          </section>
          <div style={{ ...panelStyle, borderColor: V.signal }}>
            <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Mission Operations</div>
            {deliveryResponsibility === "pilot" && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: V.raised, border: `1px solid ${editingDefinition ? V.signal : V.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ color: V.ink, fontSize: 13 }}>Your mission definition</strong>
                    <p style={{ color: V.inkDim, fontSize: 11, marginTop: 3 }}>Because you created this mission, you can adjust its name, type, and scope before submission.</p>
                  </div>
                  {!editingDefinition && <button type="button" onClick={() => setEditingDefinition(true)} style={btnGhost}>Edit mission</button>}
                </div>
                {editingDefinition && (
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <label style={{ color: V.inkDim, fontSize: 12 }}>Mission name<input value={missionName} maxLength={160} onChange={(event) => setMissionName(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} /></label>
                    <label style={{ color: V.inkDim, fontSize: 12 }}>Mission type<select value={missionServiceType} onChange={(event) => setMissionServiceType(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}>{SERVICE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label style={{ color: V.inkDim, fontSize: 12 }}>Scope and deliverables<textarea value={missionScope} maxLength={5000} onChange={(event) => setMissionScope(event.target.value)} placeholder="Describe what will be captured and what you will deliver." style={{ ...inputStyle, marginTop: 5, minHeight: 100, resize: "vertical" }} /></label>
                    <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={saveMissionDefinition} disabled={savingDefinition || !missionName.trim()} style={{ ...btnPrimary, opacity: savingDefinition || !missionName.trim() ? .5 : 1 }}>{savingDefinition ? "Saving…" : "Save mission changes"}</button><button type="button" onClick={() => { setMissionName(missionTitle); setMissionServiceType(serviceType); setMissionScope(clientRequests ?? ""); setEditingDefinition(false); }} disabled={savingDefinition} style={btnGhost}>Cancel</button></div>
                  </div>
                )}
              </div>
            )}
            <div id="mission-airspace" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ color: V.inkDim, fontSize: 13 }}>{missionLocation}</div>
              <a href={googleMapsPlaceUrl(missionLocation)} target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 12, fontWeight: 600 }}>Open site in Google Maps ↗</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 14 }}>
              <Detail label="Mission type" value={missionServiceType.replace(/_/g, " ")} />
              <Detail label="Client" value={clientCompany || clientName || "Not provided"} />
              <Detail label="Airspace" value={airspaceClass ? `Class ${airspaceClass}` : "Verify before flight"} />
            </div>
            <div id="mission-scope" style={{ marginTop: 14, padding: 12, borderRadius: 9, background: V.raised, border: `1px solid ${V.line}` }}>
              <div style={{ color: V.inkFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>Client requests / approved scope</div>
              <div style={{ color: V.ink, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 6 }}>{missionScope || "No additional client requests were recorded."}</div>
              {clientEmail && <a href={`mailto:${clientEmail}`} style={{ color: V.signal, fontSize: 12, display: "inline-block", marginTop: 8 }}>Email {clientName || "client"} ↗</a>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 14 }}>
              <div id="mission-schedule">
                <label style={{ color: V.inkDim, fontSize: 12 }}>Scheduled performance date and time</label>
                <input type="datetime-local" value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
                {performanceDate && <div id="mission-weather" aria-live="polite" style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${forecast?.rating === "unfavorable" ? V.danger : forecast?.rating === "caution" ? V.warn : forecast?.available ? V.telemetry : V.line}`, background: forecast?.rating === "unfavorable" ? "rgba(220,38,38,.08)" : forecast?.rating === "caution" ? "rgba(245,158,11,.08)" : forecast?.available ? "rgba(22,163,74,.08)" : V.raised }}>
                  {forecastLoading ? <span style={{ color: V.inkDim, fontSize: 11 }}>Checking forecast…</span> : <>{forecast?.available ? <><strong style={{ color: forecast.rating === "unfavorable" ? V.danger : forecast.rating === "caution" ? V.warn : V.telemetry, fontSize: 12 }}>{forecast.rating === "unfavorable" ? "⚠ Consider reassignment" : forecast.rating === "caution" ? "△ Weather caution" : "✓ Forecast looks favorable"}</strong><div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>{forecast.summary}</div><div style={{ color: V.ink, fontSize: 11, marginTop: 5 }}>{forecast.forecast?.lowF}–{forecast.forecast?.highF}°F · Rain {forecast.forecast?.precipitationProbability}% · Wind {forecast.forecast?.maxWindMph} mph · Gusts {forecast.forecast?.maxGustMph} mph</div>{forecast.rating === "unfavorable" && <button type="button" onClick={() => setPerformanceDate("")} style={{ ...btnGhost, padding: "5px 9px", fontSize: 11, marginTop: 7 }}>Clear date and choose another</button>}</> : <span style={{ color: V.warn, fontSize: 11 }}>{forecast?.reason}</span>}<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, paddingTop: 7, borderTop: `1px solid ${V.line}` }}><a href={missionWeatherUrl(missionLocation, new Date(performanceDate).toISOString())} target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 11, fontWeight: 700 }}>View full forecast range ↗</a><a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" style={{ color: V.signal, fontSize: 11, fontWeight: 700 }}>Aviation Weather Center ↗</a>{forecastDaysAway != null && forecastDaysAway > 10 && <span style={{ color: V.warn, fontSize: 10 }}>Long-range outlook—recheck inside 7–10 days.</span>}</div></>}
                </div>}
              </div>
              <div>
                <label style={{ color: V.inkDim, fontSize: 12 }}>Pilot operational notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access instructions, site contact coordination, equipment plan, weather considerations…" style={{ ...inputStyle, marginTop: 6, minHeight: 90, resize: "vertical" }} />
              </div>
            </div>
            <div id="mission-aircraft" style={{ marginTop: 14, padding: 14, borderRadius: 10, background: V.raised, border: `1px solid ${V.line}` }}>
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
                <div style={{ marginTop: 10, padding: 12, borderRadius: 9, border: `1px solid ${V.danger}`, background: "rgba(220,38,38,.08)" }}><strong style={{ color: V.danger, fontSize: 12 }}>No compatible aircraft found</strong><p style={{ color: V.inkDim, fontSize: 11, marginTop: 5 }}>Update Pilot Profile → Equipment with the exact manufacturer and model if you own a suitable unit. Otherwise, return this mission to DOM so it can be reassigned.</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}><button type="button" onClick={onGoToProfile} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11 }}>Update equipment profile</button>{canReturnMission ? <button type="button" onClick={forfeitMission} disabled={returningMission} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11, borderColor: V.danger, color: V.danger, opacity: returningMission ? .6 : 1 }}>{returningMission ? "Returning…" : "Return for reassignment"}</button> : <span style={{ color: V.warn, fontSize: 11, alignSelf: "center" }}>Field work has started. Contact DOM support to change pilots safely.</span>}</div></div>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 14 }}>
              <div id="mission-access"><MissionTextarea label="Site access & arrival" value={accessNotes} onChange={setAccessNotes} placeholder="Parking, gate codes, check-in, escorts, property access…" /></div>
              <div id="mission-cautions"><MissionTextarea label="Cautions & awareness" value={cautions} onChange={setCautions} placeholder="People, animals, utilities, obstacles, sensitive areas, weather or airspace concerns…" /></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <MissionTextarea label="Client communications & coordination" value={communications} onChange={setCommunications} placeholder="Log calls, emails, confirmations, changes requested, and follow-up commitments with dates…" />
              </div>
            </div>
            <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 9 }}>{deliveryResponsibility === "pilot" ? "Mission changes save to your pilot-owned job and are recorded in its activity history. Existing pricing is not changed automatically." : "Client scope, location, and pricing remain locked to the DOM-approved mission."}</p>
            <button onClick={saveOperations} disabled={savingOperations || !selectedAssessment?.compatible || !["accepted", "scheduled", "in_progress", "submitted"].includes(assignmentStatus)} style={{ ...btnPrimary, marginTop: 12, opacity: selectedAssessment?.compatible && ["accepted", "scheduled", "in_progress", "submitted"].includes(assignmentStatus) ? 1 : .5 }}>
              {savingOperations ? "Saving…" : "Save Mission Updates"}
            </button>
          </div>

          <div id="mission-documents" style={panelStyle}>
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
                    {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, textDecoration: "none" }}>Download</a>}
                  </div>
                </div>
              ))}
            </div>
            <UploadRow label="document" onUpload={uploadDoc} categories={[...DOCUMENT_CATEGORIES]} disabled={!canUpload} />
          </div>

          <div id="mission-deliverables" style={panelStyle}>
            <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>Deliverables</div>
            <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 6 }}>{pilotOwned ? "Your files become visible to the client when you certify and deliver the mission." : "Only DOM QC-passed deliverables are visible to the client."}</p>
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
                        {d.qc_passed ? (pilotOwned ? "owner approved" : "QC passed") : (pilotOwned ? "draft" : "pending QC")}
                      </span>
                      {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, textDecoration: "none" }}>Download</a>}
                      {!d.qc_passed && <span style={{ color: V.inkFaint, fontSize: 11 }}>{pilotOwned ? "Not yet released to client" : "Awaiting DOM review"}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <UploadRow label="deliverable" onUpload={uploadDeliverable} categories={[...DELIVERABLE_TYPES]} disabled={!canUpload} />
          </div>
          <MissionReviewPanel endpoint={`/api/pilot/missions/${assignmentId}/reviews`} enabled={["submitted","qc_passed","paid"].includes(assignmentStatus)} targets={[{type:"client",label:"Review Client",description:"Rate client communication, site readiness, access coordination, and professionalism."},{type:"mission",label:"Review the Gig",description:"Rate scope accuracy, site conditions, workload, pricing fairness, and whether you would accept similar work again."}]} />
          <div style={{ display: "flex", justifyContent: "flex-start" }}><button type="button" onClick={onClose} style={btnGhost}>← Back to Missions</button></div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 10, borderRadius: 8, background: V.raised }}><div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div><div style={{ color: V.ink, fontSize: 13, marginTop: 4, textTransform: label === "Mission type" ? "capitalize" : "none" }}>{value}</div></div>;
}

function CapturePlanRow({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 10, borderRadius: 8, background: V.raised }}><div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div><div style={{ color: V.ink, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 4 }}>{value}</div></div>;
}

function MissionTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label style={{ color: V.inkDim, fontSize: 12 }}>{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, marginTop: 6, minHeight: 90, resize: "vertical" }} /></div>;
}

function UploadRow({
  label,
  onUpload,
  categories,
  disabled,
}: {
  label: "document" | "deliverable";
  onUpload: (name: string, category: string, file: File) => Promise<void>;
  categories: string[];
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function submit() {
    if (!file || !name.trim()) return;
    setUploading(true);
    setLocalError(null);
    try {
      await onUpload(name.trim(), category, file);
      setName("");
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (uploadError) {
      setLocalError(uploadError instanceof Error ? uploadError.message : `Could not upload ${label}.`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
      <strong style={{ fontSize: 12 }}>Add {label}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, alignItems: "end", marginTop: 9 }}>
        <label style={{ color: V.inkDim, fontSize: 11 }}>
          Display name
          <input disabled={disabled || uploading} placeholder={`${label[0].toUpperCase()}${label.slice(1)} name`} value={name} onChange={(event) => setName(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} />
        </label>
        <label style={{ color: V.inkDim, fontSize: 11 }}>
          Category
          <select disabled={disabled || uploading} value={category} onChange={(event) => setCategory(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}>
            {categories.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label style={{ color: V.inkDim, fontSize: 11 }}>
          File
          <input
            key={inputKey}
            type="file"
            disabled={disabled || uploading}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setLocalError(null);
              if (selected && !name.trim()) setName(selected.name.replace(/\.[^.]+$/, ""));
            }}
            style={{ ...inputStyle, marginTop: 5, padding: 7 }}
          />
        </label>
        <button type="button" disabled={disabled || uploading || !file || !name.trim()} onClick={submit} style={{ ...btnPrimary, height: 37, opacity: !disabled && file && name.trim() ? 1 : 0.5, cursor: !disabled && file && name.trim() ? "pointer" : "not-allowed" }}>
          {uploading ? "Uploading…" : `Upload ${label}`}
        </button>
      </div>
      {file && <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 7 }}>Selected: {file.name} · {formatFileSize(file.size)}</p>}
      {disabled && <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 7 }}>Uploads are closed for this mission status.</p>}
      {localError && <p role="alert" style={{ color: V.danger, fontSize: 12, marginTop: 7 }}>{localError}</p>}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
