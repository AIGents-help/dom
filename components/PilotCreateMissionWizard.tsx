"use client";

import { useState, useCallback, useEffect } from "react";
import { V } from "@/lib/theme";
import { googleMapsDirectionsUrl, googleMapsPlaceUrl } from "@/lib/googleMaps";

// Pilot > Create Mission — self-service wizard for approved pilots (only
// rendered when contractors.can_create_missions is true). Modeled on
// components/PublicQuoteWizard.tsx's flow (location -> airspace -> scope ->
// quote -> submit) plus a client-contact step, since here the pilot is
// bringing their own client rather than a prospect self-serving. Styled to
// match the dark inline-style theme used throughout app/pilot/page.tsx
// rather than the marketing site's Tailwind classes.

const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 9, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "10px 18px", borderRadius: 9, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: V.inkDim };

type Step = "client" | "location" | "scope" | "quote";

interface AirspaceData {
  airspace_class: string;
  authorization_summary: string;
  nearest_airport: { icao: string; name: string; distance_nm: number; bearing: string } | null;
  operationally_verified: boolean;
  data_warning?: string | null;
  raw_source?: string;
}

interface QuoteData {
  serviceLabel: string;
  totalCents: number;
  referenceTotalCents?: number;
  warnings: string[];
}

interface CreatedQuote {
  serviceLabel: string;
  totalCents: number;
  contractorCents: number;
  commissionCents: number;
  warnings: string[];
}

export interface PilotMissionDraft {
  id: string;
  client_name: string;
  client_email: string;
  client_company: string | null;
  client_phone: string | null;
  location: string;
  latitude: number;
  longitude: number;
  airspace: AirspaceData | null;
  travel_origin: string | null;
  distance_miles: number;
  service_type: string;
  custom_mission_title: string | null;
  custom_mission_scope: string | null;
  custom_deliverables: string | null;
  site_complexity: string;
  urgency: string;
  deliverable_tier: string;
  billing_mode: "paid" | "no_charge";
  no_charge_reason: string | null;
  quote: QuoteData;
  updated_at: string;
}

export default function PilotCreateMissionWizard({
  accessToken,
  subscriptionActive,
  canFinalize,
  personalInsuranceCurrent,
  uninsuredSelfServiceEligible,
  homeAddress,
  initialDraft = null,
  onCreated,
  onDraftSaved,
}: {
  accessToken: string;
  subscriptionActive: boolean;
  canFinalize: boolean;
  personalInsuranceCurrent: boolean;
  uninsuredSelfServiceEligible: boolean;
  homeAddress: string | null;
  initialDraft?: PilotMissionDraft | null;
  onCreated: () => void;
  onDraftSaved?: () => void;
}) {
  const [step, setStep] = useState<Step>("client");
  const [error, setError] = useState<string | null>(null);

  // Client
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Location
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [airspace, setAirspace] = useState<AirspaceData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [travelOrigin, setTravelOrigin] = useState("");
  const [distanceVerified, setDistanceVerified] = useState(false);

  // Scope
  const [services, setServices] = useState<{ id: string; label: string }[]>([]);
  const [serviceType, setServiceType] = useState("roof_inspection_commercial");
  const [customMissionTitle, setCustomMissionTitle] = useState("");
  const [customMissionScope, setCustomMissionScope] = useState("");
  const [customDeliverables, setCustomDeliverables] = useState("");
  const [complexity, setComplexity] = useState("simple");
  const [urgency, setUrgency] = useState("standard");
  const [deliverableTier, setDeliverableTier] = useState("standard");
  const [distanceMiles, setDistanceMiles] = useState(15);
  const [billingMode, setBillingMode] = useState<"paid" | "no_charge">("paid");
  const [noChargeReason, setNoChargeReason] = useState("");

  // Quote + submit
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedQuote | null>(null);
  const [uninsuredConsent, setUninsuredConsent] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);

  useEffect(() => {
    if (initialDraft) return;
    setTravelOrigin(homeAddress?.trim() ?? "");
    setDistanceVerified(false);
  }, [homeAddress, initialDraft]);

  const loadServices = useCallback(async () => {
    if (services.length) return;
    try {
      const res = await fetch("/api/quote", { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (data.services) {
        setServices(data.services.map((s: any) =>
          s.id === "custom" ? { ...s, label: "Create Custom Mission" } : s
        ));
      }
    } catch {
      // non-fatal — dropdown just shows the default option
    }
  }, [accessToken, services.length]);

  useEffect(() => {
    if (!initialDraft) return;
    setDraftId(initialDraft.id);
    setClientName(initialDraft.client_name);
    setClientEmail(initialDraft.client_email);
    setClientCompany(initialDraft.client_company ?? "");
    setClientPhone(initialDraft.client_phone ?? "");
    setAddress(initialDraft.location);
    setLat(Number(initialDraft.latitude));
    setLng(Number(initialDraft.longitude));
    setAirspace(initialDraft.airspace ?? null);
    setTravelOrigin(initialDraft.travel_origin ?? homeAddress?.trim() ?? "");
    setDistanceMiles(Number(initialDraft.distance_miles));
    setDistanceVerified(true);
    setServiceType(initialDraft.service_type);
    setCustomMissionTitle(initialDraft.custom_mission_title ?? "");
    setCustomMissionScope(initialDraft.custom_mission_scope ?? "");
    setCustomDeliverables(initialDraft.custom_deliverables ?? "");
    setComplexity(initialDraft.site_complexity);
    setUrgency(initialDraft.urgency);
    setDeliverableTier(initialDraft.deliverable_tier);
    setBillingMode(initialDraft.billing_mode);
    setNoChargeReason(initialDraft.no_charge_reason ?? "");
    setQuote(initialDraft.quote);
    setUninsuredConsent(false);
    setStep("quote");
    void loadServices();
  }, [initialDraft, homeAddress, loadServices]);

  const lookupLocation = useCallback(async () => {
    if (!address.trim()) return;
    setLookingUp(true);
    setError(null);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "User-Agent": "DOM-PilotCreateMission/1.0" } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error("Address not found. Try a more specific address.");

      const lt = parseFloat(geoData[0].lat);
      const ln = parseFloat(geoData[0].lon);
      setLat(lt);
      setLng(ln);
      setAddress(geoData[0].display_name);
      setDistanceVerified(false);

      const airRes = await fetch(`/api/airspace?lat=${lt}&lng=${ln}`);
      const airData = await airRes.json().catch(() => ({}));
      if (!airRes.ok) throw new Error(airData.error ?? "Airspace verification failed.");
      if (!airData.airspace) throw new Error("Airspace verification returned no result.");
      setAirspace(airData.airspace);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLookingUp(false);
    }
  }, [address]);

  const generateQuote = useCallback(async () => {
    if (lat == null || lng == null) return;
    if (airspace?.operationally_verified !== true) {
      setError("Airspace must be authoritatively verified before this mission can continue.");
      setStep("location");
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      // No admin bearer token here on purpose — this only needs the total
      // price for the review step. The pilot's actual commission/payout
      // split is computed authoritatively server-side on submit and shown
      // afterward from that response, not guessed at client-side here
      // (this endpoint strips commission fields for non-admin callers).
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType, lat, lng, distanceMiles,
          siteComplexity: complexity, urgency, deliverableTier,
          travelDistanceSource: "pilot_google_maps_verified",
          billingMode,
          noChargeReason: billingMode === "no_charge" ? noChargeReason.trim() : undefined,
          uninsuredAcknowledged: !personalInsuranceCurrent ? uninsuredConsent : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not calculate a quote.");
      const referenceTotalCents = data.quote.totalCents;
      const nextQuote: QuoteData = {
        serviceLabel: data.quote.serviceLabel,
        totalCents: billingMode === "no_charge" ? 0 : referenceTotalCents,
        referenceTotalCents,
        warnings: data.quote.warnings ?? [],
      };

      const draftRes = await fetch("/api/pilot/missions/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          draftId,
          clientName,
          clientEmail,
          clientCompany,
          clientPhone,
          location: address,
          latitude: lat,
          longitude: lng,
          airspace,
          travelOrigin,
          distanceMiles,
          serviceType,
          customMissionTitle: serviceType === "custom" ? customMissionTitle : undefined,
          customMissionScope: serviceType === "custom" ? customMissionScope : undefined,
          customDeliverables: serviceType === "custom" ? customDeliverables : undefined,
          siteComplexity: complexity,
          urgency,
          deliverableTier,
          billingMode,
          noChargeReason: billingMode === "no_charge" ? noChargeReason.trim() : undefined,
          quote: nextQuote,
        }),
      });
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData.error ?? "Quote calculated, but the mission draft could not be saved.");
      setDraftId(draftData.draft.id);
      setQuote(nextQuote);
      setUninsuredConsent(false);
      setStep("quote");
      onDraftSaved?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuoting(false);
    }
  }, [accessToken, draftId, clientName, clientEmail, clientCompany, clientPhone, address, lat, lng, airspace, travelOrigin, distanceMiles, serviceType, customMissionTitle, customMissionScope, customDeliverables, complexity, urgency, deliverableTier, billingMode, noChargeReason, personalInsuranceCurrent, onDraftSaved]);

  const submit = useCallback(async () => {
    if (lat == null || lng == null) return;
    if (airspace?.operationally_verified !== true) {
      setError("Airspace verification is no longer valid. Re-check the mission location before creating this mission.");
      setStep("location");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/missions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          clientName, clientEmail, clientCompany, clientPhone,
          location: address, latitude: lat, longitude: lng,
          serviceType, distanceMiles, siteComplexity: complexity, urgency, deliverableTier,
          customMissionTitle: serviceType === "custom" ? customMissionTitle : undefined,
          customMissionScope: serviceType === "custom" ? customMissionScope : undefined,
          customDeliverables: serviceType === "custom" ? customDeliverables : undefined,
          travelDistanceSource: "pilot_google_maps_verified",
          billingMode,
          noChargeReason: billingMode === "no_charge" ? noChargeReason.trim() : undefined,
          draftId,
          uninsuredAcknowledged: !personalInsuranceCurrent ? uninsuredConsent : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create mission");
      setCreated({
        serviceLabel: data.quote.serviceLabel,
        totalCents: data.quote.totalCents,
        contractorCents: data.quote.contractorCents,
        commissionCents: data.quote.commissionCents,
        warnings: data.quote.warnings ?? [],
      });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, clientName, clientEmail, clientCompany, clientPhone, address, lat, lng, airspace, serviceType, distanceMiles, complexity, urgency, deliverableTier, customMissionTitle, customMissionScope, customDeliverables, billingMode, noChargeReason, personalInsuranceCurrent, uninsuredConsent, onCreated]);

  if (created) {
    return (
      <div style={{ ...panelStyle, textAlign: "center", padding: 40 }}>
        <p style={{ color: V.telemetry, fontSize: 16, fontWeight: 600 }}>Mission created</p>
        <p style={{ color: V.inkDim, fontSize: 13, marginTop: 8 }}>It's now in your Missions tab, already accepted.</p>
        <div style={{ display: "grid", gap: 6, marginTop: 18, fontSize: 13, textAlign: "left", maxWidth: 320, margin: "18px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: V.inkDim }}>
            <span>Total</span><span>${(created.totalCents / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: V.inkDim }}>
            <span>{created.commissionCents === 0 ? "DOM commission (waived)" : "DOM commission"}</span>
            <span>${(created.commissionCents / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: V.ink, fontWeight: 600 }}>
            <span>You keep</span><span>${(created.contractorCents / 100).toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setCreated(null);
            setStep("client");
            setClientName(""); setClientEmail(""); setClientCompany(""); setClientPhone("");
            setAddress(""); setLat(null); setLng(null); setAirspace(null);
            setDistanceVerified(false);
            setQuote(null);
            setDraftId(null);
            setBillingMode("paid");
            setNoChargeReason("");
            setUninsuredConsent(false);
          }}
          style={{ ...btnGhost, marginTop: 16 }}
        >
          Create another
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && (
        <div style={{ ...panelStyle, borderColor: "#DC2626" }}>
          <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {step === "client" && (
        <div style={panelStyle}>
          <p style={{ fontSize: 13, color: V.inkDim, marginBottom: 12 }}>Who's the client for this mission?</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Client name *</label>
              <input style={inputStyle} value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Client email *</label>
              <input style={inputStyle} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>
          <button
            onClick={() => { loadServices(); setStep("location"); }}
            disabled={!clientName.trim() || !clientEmail.trim()}
            style={{ ...btnPrimary, marginTop: 16 }}
          >
            Continue to location →
          </button>
        </div>
      )}

      {step === "location" && (
        <div style={panelStyle}>
          <label style={labelStyle}>Mission site address</label>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <input
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
              value={address}
              onChange={(e) => { setAddress(e.target.value); setAirspace(null); setDistanceVerified(false); }}
              onKeyDown={(e) => e.key === "Enter" && lookupLocation()}
              placeholder="123 Main St, City, State"
            />
            <button onClick={lookupLocation} disabled={lookingUp} style={btnPrimary}>
              {lookingUp ? "Checking…" : "Check airspace"}
            </button>
          </div>

          {airspace && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: airspace.operationally_verified ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)", border: `1px solid ${airspace.operationally_verified ? V.telemetry : V.danger}` }}>
              <p style={{ color: airspace.operationally_verified ? V.telemetry : V.danger, fontSize: 13, fontWeight: 700 }}>
                {airspace.operationally_verified ? `✓ Verified · Class ${airspace.airspace_class}` : "⛔ Airspace not verified — mission creation blocked"}
              </p>
              <p style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>{airspace.data_warning ?? airspace.authorization_summary}</p>
            </div>
          )}

          {airspace?.operationally_verified === true && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: `1px solid ${V.line}`, background: "rgba(14,165,233,.05)" }}>
              <div className="font-saira" style={{ fontSize: 14, fontWeight: 600 }}>Verify pilot travel</div>
              <p style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>
                Your private profile home address is the default. You can override it for this mission without changing your profile.
              </p>
              <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>Starting address or dispatch point</label>
              <input style={inputStyle} value={travelOrigin} onChange={(e) => { setTravelOrigin(e.target.value); setDistanceVerified(false); }} placeholder="Add a home address in your Profile, or enter a start point" />
              {!homeAddress?.trim() && (
                <p style={{ color: V.warn, fontSize: 11, marginTop: 5 }}>
                  No home address is saved yet. Add one in Profile to prefill this field next time.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <a href={googleMapsPlaceUrl(address)} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>View job site in Google Maps ↗</a>
                {travelOrigin.trim() && <a href={googleMapsDirectionsUrl(travelOrigin, address)} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>Open driving route ↗</a>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 240px) 1fr", gap: 12, alignItems: "end", marginTop: 12 }}>
                <div>
                  <label style={labelStyle}>Verified one-way miles *</label>
                  <input type="number" min="0.1" step="0.1" value={distanceMiles} onChange={(e) => { setDistanceMiles(Number(e.target.value)); setDistanceVerified(false); }} style={inputStyle} />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", color: V.inkDim, fontSize: 12, paddingBottom: 10 }}>
                  <input type="checkbox" checked={distanceVerified} onChange={(e) => setDistanceVerified(e.target.checked)} disabled={!travelOrigin.trim() || distanceMiles <= 0} />
                  I verified this driving distance in Google Maps.
                </label>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("client")} style={btnGhost}>← Back</button>
            {airspace?.operationally_verified === true && (
              <button onClick={() => setStep("scope")} disabled={!distanceVerified} style={{ ...btnPrimary, flex: 1, opacity: distanceVerified ? 1 : .5 }}>
                Continue to scope →
              </button>
            )}
          </div>
        </div>
      )}

      {step === "scope" && (
        <div style={panelStyle}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Service type</label>
              <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); setQuote(null); }} style={inputStyle}>
                {services.length ? services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>) : (
                  <>
                    <option value="roof_inspection_commercial">Roof Inspection (Commercial)</option>
                    <option value="aerial_images">Aerial Images</option>
                    <option value="custom">Create Custom Mission</option>
                  </>
                )}
              </select>
            </div>
            {serviceType === "custom" && (
              <div style={{ padding: 14, border: `1px solid ${V.line}`, borderRadius: 10, background: V.raised }}>
                <div className="font-saira" style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Custom mission details</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Mission title *</label>
                    <input style={inputStyle} value={customMissionTitle} onChange={(e) => setCustomMissionTitle(e.target.value)} placeholder="Example: Indoor warehouse inventory scan" />
                  </div>
                  <div>
                    <label style={labelStyle}>Scope of work *</label>
                    <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={customMissionScope} onChange={(e) => setCustomMissionScope(e.target.value)} placeholder="Describe exactly what will be flown, captured, inspected, or measured." />
                  </div>
                  <div>
                    <label style={labelStyle}>Desired deliverables <span style={{ color: V.inkFaint }}>(optional)</span></label>
                    <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={customDeliverables} onChange={(e) => setCustomDeliverables(e.target.value)} placeholder="Optional — describe the output you want. If you're not sure, DOM can determine the appropriate deliverables from the mission objective." />
                  </div>
                </div>
              </div>
            )}
            <div style={{ padding: 14, border: `1px solid ${V.line}`, borderRadius: 10, background: V.raised }}>
              <div className="font-saira" style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Billing</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => { setBillingMode("paid"); setQuote(null); }}
                  style={{ ...(billingMode === "paid" ? btnPrimary : btnGhost), flex: 1, minWidth: 140 }}
                >
                  Paid Mission
                </button>
                <button
                  type="button"
                  onClick={() => { setBillingMode("no_charge"); setQuote(null); }}
                  style={{ ...(billingMode === "no_charge" ? btnPrimary : btnGhost), flex: 1, minWidth: 140 }}
                >
                  No-Charge Mission
                </button>
              </div>
              {billingMode === "no_charge" && (
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Reason for no-charge mission *</label>
                  <select value={noChargeReason} onChange={(e) => { setNoChargeReason(e.target.value); setQuote(null); }} style={inputStyle}>
                    <option value="">Select a reason</option>
                    <option value="demo_portfolio">Demo / Portfolio</option>
                    <option value="training">Training / Practice</option>
                    <option value="goodwill">Goodwill / Courtesy</option>
                    <option value="warranty_rework">Warranty / Rework</option>
                    <option value="nonprofit">Nonprofit / Community</option>
                    <option value="internal_test">Internal Test</option>
                    <option value="other">Other</option>
                  </select>
                  <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 5 }}>
                    DOM will still calculate and retain the normal reference value for reporting, but the client price, DOM commission, and pilot payout for this mission will be $0.
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Complexity</label>
                <select value={complexity} onChange={(e) => setComplexity(e.target.value)} style={inputStyle}>
                  <option value="simple">Simple</option>
                  <option value="moderate">Moderate</option>
                  <option value="complex">Complex</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Timeline</label>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
                  <option value="standard">Standard</option>
                  <option value="priority">Priority</option>
                  <option value="rush">Rush</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Deliverables</label>
                <select value={deliverableTier} onChange={(e) => setDeliverableTier(e.target.value)} style={inputStyle}>
                  <option value="standard">Standard</option>
                  <option value="enhanced">Enhanced</option>
                  <option value="full">Full</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Verified one-way travel</label>
                <div style={{ ...inputStyle, background: V.raised }}>{distanceMiles.toFixed(1)} miles · Google Maps verified</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("location")} style={btnGhost}>← Back</button>
            <button
              onClick={generateQuote}
              disabled={quoting || (serviceType === "custom" && (!customMissionTitle.trim() || !customMissionScope.trim())) || (billingMode === "no_charge" && !noChargeReason.trim())}
              style={{ ...btnPrimary, flex: 1 }}
            >
              {quoting ? "Calculating…" : "Get quote →"}
            </button>
          </div>
        </div>
      )}

      {step === "quote" && quote && (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, color: V.inkDim }}>{quote.serviceLabel}</p>
            {draftId && <span className="font-mono-ibm" style={{ fontSize: 10, color: V.telemetry, letterSpacing: ".08em", textTransform: "uppercase" }}>✓ Draft saved</span>}
          </div>
          <p style={{ fontSize: 32, fontWeight: 700, color: V.telemetry, marginTop: 4 }}>
            ${(quote.totalCents / 100).toFixed(2)}
          </p>
          <p style={{ fontSize: 12, color: V.inkFaint, marginTop: 8 }}>
            {billingMode === "no_charge"
              ? `No-charge mission · reference value ${((quote.referenceTotalCents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · reason: ${noChargeReason.replaceAll("_", " ")}`
              : subscriptionActive
                ? "You're subscribed — you'll keep the full total, no DOM commission."
                : "Your exact payout after DOM's commission will be shown once the mission is created."}
          </p>
          {quote.warnings.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(229,112,31,.08)" }}>
              {quote.warnings.map((w, i) => <p key={i} style={{ color: V.warn, fontSize: 12 }}>⚠ {w}</p>)}
            </div>
          )}
          {!personalInsuranceCurrent && uninsuredSelfServiceEligible && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 9, border: `1px solid ${V.warn}`, background: "rgba(245,158,11,.08)" }}>
              <strong style={{ color: V.warn, fontSize: 12 }}>Per-mission insurance responsibility</strong>
              <p style={{ color: V.inkDim, fontSize: 11, marginTop: 5 }}>
                DOM Admin has authorized your uninsured self-service path. This authorization does not create insurance coverage. To create this mission, you must explicitly accept responsibility for this mission.
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, color: V.ink, fontSize: 12, marginTop: 10 }}>
                <input type="checkbox" checked={uninsuredConsent} onChange={(event) => setUninsuredConsent(event.target.checked)} />
                <span>I elect to proceed without a verified insurance policy for this pilot-owned mission. I remain responsible for all legal, client, property-owner, and site insurance requirements and for my independent flight operations.</span>
              </label>
            </div>
          )}
          {!personalInsuranceCurrent && !uninsuredSelfServiceEligible && (
            <p style={{ fontSize: 12, color: V.warn, marginTop: 12 }}>
              A current verified insurance policy or Admin-authorized uninsured self-service path is required before this mission can be created.
            </p>
          )}
          {!canFinalize && (
            <p style={{ fontSize: 12, color: V.warn, marginTop: 12 }}>
              This is a preview — your account is not currently authorized to finalize self-service missions.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("scope")} style={btnGhost}>← Adjust</button>
            <button
              onClick={submit}
              disabled={submitting || !canFinalize || (!personalInsuranceCurrent && !uninsuredConsent)}
              title={!canFinalize ? "Not authorized for self-service mission creation" : (!personalInsuranceCurrent && !uninsuredConsent) ? "Accept the uninsured responsibility acknowledgement to continue" : undefined}
              style={{ ...btnPrimary, flex: 1, ...((canFinalize && (personalInsuranceCurrent || uninsuredConsent)) ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
            >
              {submitting ? "Creating…" : !canFinalize ? "Authorization required" : (!personalInsuranceCurrent && !uninsuredConsent) ? "Accept responsibility to create" : "Create mission →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
