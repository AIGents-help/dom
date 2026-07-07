"use client";

import { useState, useCallback } from "react";

// Pilot > Create Mission — self-service wizard for approved pilots (only
// rendered when contractors.can_create_missions is true). Modeled on
// components/PublicQuoteWizard.tsx's flow (location -> airspace -> scope ->
// quote -> submit) plus a client-contact step, since here the pilot is
// bringing their own client rather than a prospect self-serving. Styled to
// match the dark inline-style theme used throughout app/pilot/page.tsx
// rather than the marketing site's Tailwind classes.

const V = { ground: "#0A0E14", surface: "#11161F", raised: "#161D29", line: "#232C3B", lineSoft: "#1A222F", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
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
}

interface QuoteData {
  serviceLabel: string;
  totalCents: number;
  warnings: string[];
}

interface CreatedQuote {
  serviceLabel: string;
  totalCents: number;
  contractorCents: number;
  commissionCents: number;
  warnings: string[];
}

export default function PilotCreateMissionWizard({
  accessToken,
  subscriptionActive,
  canFinalize,
  onCreated,
}: {
  accessToken: string;
  subscriptionActive: boolean;
  canFinalize: boolean;
  onCreated: () => void;
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

  // Scope
  const [services, setServices] = useState<{ id: string; label: string }[]>([]);
  const [serviceType, setServiceType] = useState("roof_inspection_commercial");
  const [complexity, setComplexity] = useState("simple");
  const [urgency, setUrgency] = useState("standard");
  const [deliverableTier, setDeliverableTier] = useState("standard");
  const [distanceMiles, setDistanceMiles] = useState(15);

  // Quote + submit
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedQuote | null>(null);

  const loadServices = useCallback(async () => {
    if (services.length) return;
    try {
      const res = await fetch("/api/quote", { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (data.services) setServices(data.services.filter((s: any) => s.id !== "custom"));
    } catch {
      // non-fatal — dropdown just shows the default option
    }
  }, [accessToken, services.length]);

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

      const airRes = await fetch(`/api/airspace?lat=${lt}&lng=${ln}`);
      const airData = await airRes.json();
      if (airData.airspace) setAirspace(airData.airspace);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLookingUp(false);
    }
  }, [address]);

  const generateQuote = useCallback(async () => {
    if (lat == null || lng == null) return;
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not calculate a quote.");
      setQuote({ serviceLabel: data.quote.serviceLabel, totalCents: data.quote.totalCents, warnings: data.quote.warnings ?? [] });
      setStep("quote");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuoting(false);
    }
  }, [lat, lng, serviceType, distanceMiles, complexity, urgency, deliverableTier]);

  const submit = useCallback(async () => {
    if (lat == null || lng == null) return;
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
  }, [accessToken, clientName, clientEmail, clientCompany, clientPhone, address, lat, lng, serviceType, distanceMiles, complexity, urgency, deliverableTier, onCreated]);

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
            setQuote(null);
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
        <div style={{ ...panelStyle, borderColor: "#FF8A3D" }}>
          <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
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
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupLocation()}
              placeholder="123 Main St, City, State"
            />
            <button onClick={lookupLocation} disabled={lookingUp} style={btnPrimary}>
              {lookingUp ? "Checking…" : "Check airspace"}
            </button>
          </div>

          {airspace && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: V.raised }}>
              <p style={{ color: V.telemetry, fontSize: 13, fontWeight: 600 }}>Class {airspace.airspace_class}</p>
              <p style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>{airspace.authorization_summary}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("client")} style={btnGhost}>← Back</button>
            {airspace && (
              <button onClick={() => setStep("scope")} style={{ ...btnPrimary, flex: 1 }}>
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
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} style={inputStyle}>
                {services.length ? services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>) : (
                  <option value="roof_inspection_commercial">Roof Inspection (Commercial)</option>
                )}
              </select>
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
                <label style={labelStyle}>Distance (miles)</label>
                <input type="number" value={distanceMiles} onChange={(e) => setDistanceMiles(Number(e.target.value))} style={inputStyle} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("location")} style={btnGhost}>← Back</button>
            <button onClick={generateQuote} disabled={quoting} style={{ ...btnPrimary, flex: 1 }}>
              {quoting ? "Calculating…" : "Get quote →"}
            </button>
          </div>
        </div>
      )}

      {step === "quote" && quote && (
        <div style={panelStyle}>
          <p style={{ fontSize: 13, color: V.inkDim }}>{quote.serviceLabel}</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: V.telemetry, marginTop: 4 }}>
            ${(quote.totalCents / 100).toFixed(2)}
          </p>
          <p style={{ fontSize: 12, color: V.inkFaint, marginTop: 8 }}>
            {subscriptionActive
              ? "You're subscribed — you'll keep the full total, no DOM commission."
              : "Your exact payout after DOM's commission will be shown once the mission is created."}
          </p>
          {quote.warnings.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(255,138,61,.08)" }}>
              {quote.warnings.map((w, i) => <p key={i} style={{ color: V.signal, fontSize: 12 }}>⚠ {w}</p>)}
            </div>
          )}
          {!canFinalize && (
            <p style={{ fontSize: 12, color: V.signal, marginTop: 12 }}>
              This is a preview — your account isn't yet approved for self-service, so this mission can't be
              finalized. Ask DOM admin to approve you once you're ready.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("scope")} style={btnGhost}>← Adjust</button>
            <button
              onClick={submit}
              disabled={submitting || !canFinalize}
              title={canFinalize ? undefined : "Not yet approved for self-service mission creation"}
              style={{ ...btnPrimary, flex: 1, ...(canFinalize ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
            >
              {submitting ? "Creating…" : canFinalize ? "Create mission →" : "Pending admin approval"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
