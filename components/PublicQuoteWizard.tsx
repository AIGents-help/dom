"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

// Public self-service quoting wizard: /get-a-quote
// Location -> auto airspace classification -> scope -> auto-quote -> submit.
// Mirrors the admin Create Mission wizard's flow (app/admin/missions/create/page.tsx)
// but talks to the same /api/airspace + /api/quote endpoints unauthenticated, which
// strip commission/payout fields server-side — this component never sees or sends
// DOM's commission data. The final submit sends raw scoping inputs (not a
// client-computed total) so /api/mission-request recomputes the quote itself.

type Step = "location" | "scope" | "quote" | "contact";

type DistanceBand = "local" | "regional" | "extended" | "remote";
const DISTANCE_BAND_MILES: Record<DistanceBand, number> = {
  local: 15,
  regional: 45,
  extended: 80,
  remote: 120,
};
const DISTANCE_BAND_LABELS: Record<DistanceBand, string> = {
  local: "Local (within ~30 mi)",
  regional: "Regional (~30-60 mi)",
  extended: "Extended (~60-100 mi)",
  remote: "Remote (100+ mi)",
};

interface AirspaceData {
  airspace_class: string;
  max_altitude_ft: number;
  nearest_airport: { icao: string; name: string; distance_nm: number; bearing: string } | null;
  laanc_required: boolean;
  risk_level: string;
  authorization_summary: string;
  raw_source: string;
}

interface ServiceOption {
  id: string;
  label: string;
  basePrice: string;
}

interface PublicQuoteData {
  serviceLabel: string;
  basePriceCents: number;
  modifiers: Record<string, { factor: number; label: string }>;
  combinedMultiplier: number;
  totalCents: number;
  canOperate: boolean;
  warnings: string[];
}

export default function PublicQuoteWizard({
  requestedContractorId,
  requestedPilotName,
}: {
  requestedContractorId?: string;
  requestedPilotName?: string;
} = {}) {
  const [step, setStep] = useState<Step>("location");

  // Location
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [airspace, setAirspace] = useState<AirspaceData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Scope
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceType, setServiceType] = useState("");
  const [complexity, setComplexity] = useState("simple");
  const [urgency, setUrgency] = useState("standard");
  const [deliverableTier, setDeliverableTier] = useState("standard");
  const [distanceBand, setDistanceBand] = useState<DistanceBand>("local");

  // Quote
  const [quote, setQuote] = useState<PublicQuoteData | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Contact + submit
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/quote");
        const data = await res.json();
        if (data.services) {
          setServices(data.services.filter((s: ServiceOption) => s.id !== "custom"));
          if (data.services.length) setServiceType(data.services[0].id);
        }
      } catch {
        // service list is a nice-to-have; the wizard still works without it
      }
    })();
  }, []);

  const lookupLocation = useCallback(async () => {
    if (!address.trim()) return;
    setLookingUp(true);
    setError(null);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "User-Agent": "DOM-GetAQuote/1.0" } }
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
    if (lat == null || lng == null || !serviceType) return;
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType,
          lat,
          lng,
          distanceMiles: DISTANCE_BAND_MILES[distanceBand],
          siteComplexity: complexity,
          urgency,
          deliverableTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not calculate a quote.");
      if (data.quote) {
        setQuote(data.quote);
        setStep("quote");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuoting(false);
    }
  }, [lat, lng, serviceType, distanceBand, complexity, urgency, deliverableTier]);

  const submitRequest = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mission-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester_name: clientName,
          requester_email: clientEmail,
          contactPhone: clientPhone,
          company: clientCompany,
          location: address,
          latitude: lat,
          longitude: lng,
          service_type: serviceType,
          serviceType,
          distanceMiles: DISTANCE_BAND_MILES[distanceBand],
          siteComplexity: complexity,
          urgency,
          deliverableTier,
          timeline: urgency,
          airspace_class: airspace?.airspace_class,
          scope: notes,
          budget_range: quote ? `$${(quote.totalCents / 100).toFixed(2)}` : undefined,
          industry: "commercial",
          requestedContractorId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to submit request");
      }
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [clientName, clientEmail, clientPhone, clientCompany, address, lat, lng, serviceType, distanceBand, complexity, urgency, deliverableTier, airspace, notes, quote, requestedContractorId]);

  if (success) {
    return (
      <div className="card flex flex-col items-center gap-4 p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-accent" />
        <h3 className="text-xl font-semibold text-white">Request received</h3>
        <p className="body-muted max-w-md">
          Thanks, {clientName.split(" ")[0] || "there"}. Our operations team will confirm scope
          and compliance, then follow up within one business day to schedule your mission
          {requestedPilotName ? ` — we'll do our best to get ${requestedPilotName} on this one` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-6 p-8 lg:p-10">
      <StepIndicator current={step} />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {step === "location" && (
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="address">Mission site address</label>
            <div className="flex gap-3">
              <input
                id="address"
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupLocation()}
                placeholder="123 Main St, City, State"
              />
              <button onClick={lookupLocation} disabled={lookingUp} className="btn-primary whitespace-nowrap">
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check airspace"}
              </button>
            </div>
          </div>

          {airspace && (
            <div className="rounded-lg border border-border bg-surface2 p-4 text-sm">
              <p className="mb-2 font-semibold text-white">Airspace: Class {airspace.airspace_class}</p>
              <p className="body-muted">{airspace.authorization_summary}</p>
              {airspace.nearest_airport && (
                <p className="mt-2 text-xs text-slate-500">
                  Nearest airport: {airspace.nearest_airport.name} ({airspace.nearest_airport.icao}),{" "}
                  {airspace.nearest_airport.distance_nm} nm {airspace.nearest_airport.bearing}
                </p>
              )}
            </div>
          )}

          {airspace && (
            <button onClick={() => setStep("scope")} className="btn-primary w-full sm:w-auto">
              Continue to service details →
            </button>
          )}
        </div>
      )}

      {step === "scope" && (
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="serviceType">Service needed</label>
            <select id="serviceType" className="input" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.label} — {s.basePrice}+</option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="complexity">Site complexity</label>
              <select id="complexity" className="input" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
                <option value="simple">Simple (single structure, open)</option>
                <option value="moderate">Moderate (multiple structures)</option>
                <option value="complex">Complex (obstacles, terrain)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="urgency">Timeline</label>
              <select id="urgency" className="input" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="standard">Standard (5-7 business days)</option>
                <option value="priority">Priority (2-3 business days)</option>
                <option value="rush">Rush (24-48 hours)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="deliverableTier">Deliverables</label>
              <select id="deliverableTier" className="input" value={deliverableTier} onChange={(e) => setDeliverableTier(e.target.value)}>
                <option value="standard">Standard (images + report)</option>
                <option value="enhanced">Enhanced (ortho + 3D model)</option>
                <option value="full">Full (all outputs + raw data)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="distanceBand">Distance from our base</label>
              <select id="distanceBand" className="input" value={distanceBand} onChange={(e) => setDistanceBand(e.target.value as DistanceBand)}>
                {(Object.keys(DISTANCE_BAND_LABELS) as DistanceBand[]).map((b) => (
                  <option key={b} value={b}>{DISTANCE_BAND_LABELS[b]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("location")} className="btn-secondary">← Back</button>
            <button onClick={generateQuote} disabled={quoting || !serviceType} className="btn-primary flex-1">
              {quoting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Get instant quote →"}
            </button>
          </div>
        </div>
      )}

      {step === "quote" && quote && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-surface2 p-6">
            <p className="text-sm text-slate-400">{quote.serviceLabel}</p>
            <p className="mt-1 text-4xl font-bold text-accent">${(quote.totalCents / 100).toFixed(2)}</p>

            <div className="mt-4 space-y-1 text-sm">
              <ModRow label="Base price" value={`$${(quote.basePriceCents / 100).toFixed(2)}`} />
              <ModRow label={`Location × ${quote.modifiers.location.factor}`} value={quote.modifiers.location.label} />
              <ModRow label={`Airspace × ${quote.modifiers.airspace.factor}`} value={quote.modifiers.airspace.label} />
              <ModRow label={`Complexity × ${quote.modifiers.complexity.factor}`} value={quote.modifiers.complexity.label} />
              <ModRow label={`Timeline × ${quote.modifiers.urgency.factor}`} value={quote.modifiers.urgency.label} />
              <ModRow label={`Deliverables × ${quote.modifiers.deliverable.factor}`} value={quote.modifiers.deliverable.label} />
            </div>

            {quote.warnings.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                {quote.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-400">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">
            This is an automated estimate based on airspace classification and scope. Final pricing
            is confirmed by our operations team before scheduling.
          </p>

          <div className="flex gap-3">
            <button onClick={() => setStep("scope")} className="btn-secondary">← Adjust scope</button>
            <button onClick={() => setStep("contact")} disabled={!quote.canOperate} className="btn-primary flex-1">
              {quote.canOperate ? "Continue to contact info →" : "Cannot proceed — see warnings"}
            </button>
          </div>
        </div>
      )}

      {step === "contact" && (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="clientName">Full name *</label>
              <input id="clientName" className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="clientEmail">Email *</label>
              <input id="clientEmail" type="email" className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="clientPhone">Phone</label>
              <input id="clientPhone" className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="clientCompany">Company</label>
              <input id="clientCompany" className="input" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="notes">Anything else we should know?</label>
            <textarea id="notes" className="input min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("quote")} className="btn-secondary">← Back</button>
            <button
              onClick={submitRequest}
              disabled={submitting || !clientName.trim() || !clientEmail.trim()}
              className="btn-primary flex-1"
            >
              {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Submit request →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "location", label: "Location" },
    { key: "scope", label: "Service" },
    { key: "quote", label: "Quote" },
    { key: "contact", label: "Contact" },
  ];
  return (
    <div className="flex gap-2">
      {steps.map((s) => (
        <span
          key={s.key}
          className={`rounded-md px-3 py-1 text-xs font-medium ${
            s.key === current ? "bg-accent/15 text-accent" : "text-slate-500"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ModRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-400">
      <span>{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}
