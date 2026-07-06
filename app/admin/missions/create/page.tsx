"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Admin > Create Mission — the interactive intake wizard.
// Step 1: Location → auto airspace classification
// Step 2: Service scope → complexity, urgency, deliverables
// Step 3: Auto-quote → review and confirm
// Creates the mission_request in Supabase on confirm.
// Gated by Supabase Auth, matching every other /admin page.

type Step = "location" | "scope" | "quote" | "confirm";

interface AirspaceData {
  airspace_class: string;
  max_altitude_ft: number;
  nearest_airport: { icao: string; name: string; distance_nm: number; bearing: string } | null;
  laanc_required: boolean;
  risk_level: string;
  authorization_summary: string;
  raw_source: string;
}

interface QuoteData {
  serviceLabel: string;
  basePriceCents: number;
  modifiers: Record<string, { factor: number; label: string }>;
  combinedMultiplier: number;
  totalCents: number;
  commissionCents: number;
  contractorPayoutCents: number;
  commissionRate: string;
  canOperate: boolean;
  warnings: string[];
}

export default function CreateMissionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("location");
  const [authed, setAuthed] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        router.push("/admin/login");
        return;
      }
      setAccessToken(data.session.access_token);
      setAuthed(true);
    })();
  }, [router]);

  // Location
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [airspace, setAirspace] = useState<AirspaceData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Client
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");

  // Scope
  const [serviceType, setServiceType] = useState("roof_inspection_commercial");
  const [complexity, setComplexity] = useState("simple");
  const [urgency, setUrgency] = useState("standard");
  const [deliverableTier, setDeliverableTier] = useState("standard");
  const [distanceMiles, setDistanceMiles] = useState(15);
  const [scopeNotes, setScopeNotes] = useState("");

  // Quote
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Geocode + airspace lookup ──
  const lookupLocation = useCallback(async () => {
    if (!address.trim()) return;
    setLookingUp(true);
    setError(null);
    try {
      // Geocode via Nominatim (free, no key needed)
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "User-Agent": "DOM-MissionControl/1.0" } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error("Address not found. Try a more specific address.");

      const lt = parseFloat(geoData[0].lat);
      const ln = parseFloat(geoData[0].lon);
      setLat(lt);
      setLng(ln);
      setAddress(geoData[0].display_name);

      // Auto-classify airspace
      const airRes = await fetch(`/api/airspace?lat=${lt}&lng=${ln}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      const airData = await airRes.json();
      if (airData.airspace) setAirspace(airData.airspace);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLookingUp(false);
    }
  }, [address, accessToken]);

  // ── Generate quote ──
  const generateQuote = useCallback(async () => {
    if (lat == null || lng == null) return;
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          serviceType,
          lat,
          lng,
          distanceMiles,
          siteComplexity: complexity,
          urgency,
          deliverableTier,
        }),
      });
      const data = await res.json();
      if (data.quote) {
        setQuote(data.quote);
        setStep("quote");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuoting(false);
    }
  }, [lat, lng, serviceType, distanceMiles, complexity, urgency, deliverableTier, accessToken]);

  // ── Submit mission ──
  const submitMission = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mission-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester_name: clientName,
          requester_email: clientEmail,
          company: clientCompany,
          location: address,
          latitude: lat,
          longitude: lng,
          service_type: serviceType,
          scope: scopeNotes,
          budget_range: quote ? `$${(quote.totalCents / 100).toFixed(2)}` : undefined,
          industry: "commercial",
          timeline: urgency,
          airspace_class: airspace?.airspace_class,
          quote,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create mission");
      }
      router.push("/admin/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [clientName, clientEmail, clientCompany, address, lat, lng, serviceType, scopeNotes, urgency, airspace, quote, router]);

  if (!authed) return null;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="font-saira" style={{ fontSize: 26, fontWeight: 700 }}>Create Mission</h1>
        <StepIndicator current={step} />
      </div>

      {error && <div style={{ ...panel, borderColor: "#FF8A3D", marginBottom: 18 }}><p style={{ color: "#FF8A3D", fontSize: 14 }}>{error}</p></div>}

      {/* ═══ STEP 1: LOCATION ═══ */}
      {step === "location" && (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={panel}>
            <Label>Client Information</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <Input label="Contact name" value={clientName} onChange={setClientName} />
              <Input label="Company" value={clientCompany} onChange={setClientCompany} />
            </div>
            <Input label="Email" value={clientEmail} onChange={setClientEmail} type="email" />
          </div>

          <div style={panel}>
            <Label>Mission Location</Label>
            <p style={{ color: V.inkDim, fontSize: 13, marginBottom: 10 }}>
              Enter the job site address. The system will automatically classify the airspace.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupLocation()}
                placeholder="123 Main St, City, State"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={lookupLocation} disabled={lookingUp} style={btnPrimary}>
                {lookingUp ? "Looking up…" : "Classify Airspace"}
              </button>
            </div>
            {lat != null && (
              <p className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 8 }}>
                {lat.toFixed(5)}°N · {Math.abs(lng!).toFixed(5)}°W
              </p>
            )}
          </div>

          {/* Airspace result */}
          {airspace && <AirspacePanel data={airspace} />}

          {airspace && (
            <button onClick={() => setStep("scope")} style={btnPrimary}>
              Continue to Mission Scope →
            </button>
          )}
        </div>
      )}

      {/* ═══ STEP 2: SCOPE ═══ */}
      {step === "scope" && (
        <div style={{ display: "grid", gap: 18 }}>
          {airspace && <AirspacePanel data={airspace} compact />}

          <div style={panel}>
            <Label>Service Type</Label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} style={inputStyle}>
              <option value="roof_inspection_residential">Roof Inspection (Residential) — $350</option>
              <option value="roof_inspection_commercial">Roof Inspection (Commercial) — $550</option>
              <option value="construction_progress">Construction Progress Mapping — $650</option>
              <option value="thermal_inspection">Thermal + Visual Inspection — $850</option>
              <option value="ortho_survey">Orthomosaic Survey — $1,200</option>
              <option value="powerline_inspection">Powerline / Utility Inspection — $950</option>
              <option value="real_estate_media">Real Estate Aerial Media — $250</option>
            </select>
          </div>

          <div style={{ ...panel, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <Label>Site Complexity</Label>
              <select value={complexity} onChange={(e) => setComplexity(e.target.value)} style={inputStyle}>
                <option value="simple">Simple (single structure, open)</option>
                <option value="moderate">Moderate (multiple structures)</option>
                <option value="complex">Complex (obstacles, terrain)</option>
              </select>
            </div>
            <div>
              <Label>Urgency</Label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
                <option value="standard">Standard (5-7 business days)</option>
                <option value="priority">Priority (2-3 business days)</option>
                <option value="rush">Rush (24-48 hours)</option>
              </select>
            </div>
            <div>
              <Label>Deliverable Tier</Label>
              <select value={deliverableTier} onChange={(e) => setDeliverableTier(e.target.value)} style={inputStyle}>
                <option value="standard">Standard (images + report)</option>
                <option value="enhanced">Enhanced (ortho + 3D model)</option>
                <option value="full">Full (all outputs + raw data)</option>
              </select>
            </div>
            <div>
              <Label>Distance to site (miles)</Label>
              <input type="number" value={distanceMiles} onChange={(e) => setDistanceMiles(Number(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={panel}>
            <Label>Scope Notes</Label>
            <textarea
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              placeholder="Specific structures, access notes, client requirements…"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setStep("location")} style={btnGhost}>← Back</button>
            <button onClick={generateQuote} disabled={quoting} style={{ ...btnPrimary, flex: 1 }}>
              {quoting ? "Calculating…" : "Generate Quote →"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: QUOTE ═══ */}
      {step === "quote" && quote && (
        <div style={{ display: "grid", gap: 18 }}>
          {airspace && <AirspacePanel data={airspace} compact />}

          <div style={panel}>
            <Label>Mission Quote</Label>
            <div className="font-mono-ibm" style={{ fontSize: 36, color: V.telemetry, margin: "8px 0" }}>
              ${(quote.totalCents / 100).toFixed(2)}
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <ModRow label="Base price" value={`$${(quote.basePriceCents / 100).toFixed(2)}`} />
              <ModRow label={`Location × ${quote.modifiers.location.factor}`} value={quote.modifiers.location.label} dim />
              <ModRow label={`Airspace × ${quote.modifiers.airspace.factor}`} value={quote.modifiers.airspace.label} dim />
              <ModRow label={`Complexity × ${quote.modifiers.complexity.factor}`} value={quote.modifiers.complexity.label} dim />
              <ModRow label={`Urgency × ${quote.modifiers.urgency.factor}`} value={quote.modifiers.urgency.label} dim />
              <ModRow label={`Deliverable × ${quote.modifiers.deliverable.factor}`} value={quote.modifiers.deliverable.label} dim />
              <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 10, marginTop: 4 }}>
                <ModRow label={`DOM commission (${quote.commissionRate})`} value={`$${(quote.commissionCents / 100).toFixed(2)}`} accent />
                <ModRow label="Contractor payout" value={`$${(quote.contractorPayoutCents / 100).toFixed(2)}`} />
              </div>
            </div>

            {quote.warnings.length > 0 && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,138,61,.08)", border: `1px solid rgba(255,138,61,.25)` }}>
                {quote.warnings.map((w, i) => (
                  <p key={i} style={{ color: V.signal, fontSize: 13 }}>⚠ {w}</p>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setStep("scope")} style={btnGhost}>← Adjust Scope</button>
            <button onClick={submitMission} disabled={submitting} style={{ ...btnPrimary, flex: 1 }}>
              {submitting ? "Creating…" : "Create Mission →"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ── Airspace Panel ──
function AirspacePanel({ data, compact }: { data: AirspaceData; compact?: boolean }) {
  const cls = data.airspace_class;
  const riskColors: Record<string, string> = { low: V.telemetry, moderate: V.signal, elevated: "#E5701F", high: "#EF4444" };
  const riskColor = riskColors[data.risk_level] ?? V.inkDim;

  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Label>Airspace Classification</Label>
        <span className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint }}>
          VIA {data.raw_source === "airhub_api" ? "AIRHUB API" : "FAA ESTIMATE"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 10, overflow: "hidden", marginTop: 10 }}>
        <Readout k="Class" v={`CLASS ${cls}`} color={["B", "C", "D"].includes(cls) ? V.signal : V.telemetry} />
        <Readout k="Max Altitude" v={`${data.max_altitude_ft} ft AGL`} />
        {data.nearest_airport && (
          <Readout k="Nearest Airport" v={`${data.nearest_airport.icao} (${data.nearest_airport.distance_nm} nm ${data.nearest_airport.bearing})`} />
        )}
        <Readout k="LAANC" v={data.laanc_required ? "REQUIRED" : "NOT REQUIRED"} color={data.laanc_required ? V.signal : V.telemetry} />
        <Readout k="Risk Level" v={data.risk_level.toUpperCase()} color={riskColor} />
        {!compact && <Readout k="Authorization" v={data.authorization_summary.slice(0, 60) + (data.authorization_summary.length > 60 ? "…" : "")} />}
      </div>
    </div>
  );
}

function Readout({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: V.raised, padding: "10px 14px" }}>
      <div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div>
      <div className="font-mono-ibm" style={{ fontSize: 13, color: color ?? V.telemetry, marginTop: 2, fontWeight: 500 }}>{v}</div>
    </div>
  );
}

function ModRow({ label, value, dim, accent }: { label: string; value: string; dim?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: accent ? V.signal : dim ? V.inkDim : V.ink }}>
      <span>{label}</span>
      <span className="font-mono-ibm" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["location", "scope", "quote"];
  const labels = { location: "Location", scope: "Scope", quote: "Quote", confirm: "Done" };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {steps.map((s) => (
        <span key={s} className="font-mono-ibm" style={{
          fontSize: 11, padding: "4px 10px", borderRadius: 6,
          background: s === current ? "rgba(255,138,61,.14)" : "transparent",
          color: s === current ? V.signal : V.inkFaint,
        }}>
          {labels[s]}
        </span>
      ))}
    </div>
  );
}

// ── Shared UI ──
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: V.signal }}>{children}</div>;
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 12, color: V.inkDim }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

// ── Design tokens ──
const V = {
  ground: "#0A0E14", surface: "#11161F", raised: "#161D29",
  line: "#232C3B", lineSoft: "#1A222F",
  ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678",
  signal: "#FF8A3D", telemetry: "#4FD1C5",
};
const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 22 };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
const btnPrimary: React.CSSProperties = { padding: "12px 20px", borderRadius: 10, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "12px 20px", borderRadius: 10, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" };
