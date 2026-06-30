"use client";

import { useState, FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function MissionRequestForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/mission-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Request failed");

      setSuccess(true);
      form.reset();
    } catch (err) {
      setError("Something went wrong submitting your request. Please try again or email ops@droneopsman.com.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="card flex flex-col items-center gap-4 p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-accent" />
        <h3 className="text-xl font-semibold text-white">Mission request received</h3>
        <p className="body-muted max-w-md">
          Thank you. Our operations team will review your request and follow up within one
          business day with scope, compliance status, and scheduling options.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="btn-secondary mt-2"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 p-8 lg:p-10">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contactName">Full Name *</label>
          <input className="input" id="contactName" name="contactName" required placeholder="Jane Doe" />
        </div>
        <div>
          <label className="label" htmlFor="contactEmail">Email *</label>
          <input className="input" id="contactEmail" name="contactEmail" type="email" required placeholder="jane@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="contactPhone">Phone</label>
          <input className="input" id="contactPhone" name="contactPhone" placeholder="(555) 555-5555" />
        </div>
        <div>
          <label className="label" htmlFor="company">Company / Organization</label>
          <input className="input" id="company" name="company" placeholder="Acme Infrastructure" />
        </div>
        <div>
          <label className="label" htmlFor="industry">Industry</label>
          <select className="input" id="industry" name="industry" defaultValue="">
            <option value="" disabled>Select industry</option>
            <option>Energy & Utilities</option>
            <option>Construction & Real Estate</option>
            <option>Agriculture</option>
            <option>Public Safety</option>
            <option>Infrastructure & Engineering</option>
            <option>Government & Public Sector</option>
            <option>Logistics & Industrial</option>
            <option>Insurance & Risk Assessment</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="serviceType">Service Needed</label>
          <select className="input" id="serviceType" name="serviceType" defaultValue="">
            <option value="" disabled>Select service</option>
            <option>Aerial Cinematography</option>
            <option>Mapping & Surveying</option>
            <option>Infrastructure Inspection</option>
            <option>Thermal & Multispectral Imaging</option>
            <option>Data & Analytics</option>
            <option>BVLOS Operations</option>
            <option>Construction Monitoring</option>
            <option>Not sure yet</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="location">Mission Location</label>
          <input className="input" id="location" name="location" placeholder="City, State" />
        </div>
        <div>
          <label className="label" htmlFor="preferredDate">Preferred Date</label>
          <input className="input" id="preferredDate" name="preferredDate" type="date" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="budgetRange">Estimated Budget Range</label>
          <select className="input" id="budgetRange" name="budgetRange" defaultValue="">
            <option value="" disabled>Select range</option>
            <option>Under $2,500</option>
            <option>$2,500 – $10,000</option>
            <option>$10,000 – $50,000</option>
            <option>$50,000+</option>
            <option>Recurring program / not sure</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="details">Mission Details</label>
          <textarea
            className="input min-h-[140px]"
            id="details"
            name="details"
            placeholder="Describe the site, scope, deliverables, and any compliance requirements."
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
          </>
        ) : (
          "Submit Mission Request"
        )}
      </button>
    </form>
  );
}
