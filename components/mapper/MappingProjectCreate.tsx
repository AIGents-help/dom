"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, WandSparkles } from "lucide-react";
import { V, panelStyle, btnPrimary, btnGhost, inputStyle, labelStyle } from "./theme";
import type { EligibleJob } from "./types";

export default function MappingProjectCreate({
  accessToken,
  onCreated,
  onCancel,
}: {
  accessToken: string;
  onCreated: (projectId: string) => void;
  onCancel: () => void;
}) {
  const [jobs, setJobs] = useState<EligibleJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobId, setJobId] = useState("");
  const [name, setName] = useState("");
  const [locationSnapshot, setLocationSnapshot] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingJobs(true);
      const res = await fetch("/api/pilot/mapping/jobs-eligible", { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs(body.jobs ?? []);
        setError(null);
      } else {
        setJobs([]);
        setError(body.error ?? "Eligible missions could not be loaded.");
      }
      setLoadingJobs(false);
    })();
  }, [accessToken]);

  function selectJob(nextJobId: string) {
    setJobId(nextJobId);
    const job = jobs.find((item) => item.id === nextJobId);
    if (!job) return;
    if (!locationSnapshot) setLocationSnapshot(job.location ?? "");
    if (!name) setName(`${job.title} — DOMINIC`);
  }

  async function create() {
    if (!jobId) { setError("Select a mission first."); return; }
    if (!name.trim()) { setError("Project name is required."); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/pilot/mapping/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        job_id: jobId,
        name: name.trim(),
        location_snapshot: locationSnapshot.trim() || undefined,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(body.error ?? "Could not create the DOMINIC project."); return; }
    onCreated(body.project.id);
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <button onClick={onCancel} style={{ ...btnGhost, marginBottom: 12, padding: "7px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <ArrowLeft size={14} /> Projects
      </button>

      <div style={{ ...panelStyle, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, color: V.signal, marginBottom: 8 }}>
          <WandSparkles size={18} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>New DOMINIC Project</span>
        </div>
        <div className="font-saira" style={{ fontWeight: 800, fontSize: 24, color: V.ink, marginBottom: 4 }}>Start with the mission.</div>
        <p style={{ color: V.inkDim, fontSize: 13, marginBottom: 20, lineHeight: 1.55 }}>
          DOM already knows the client and mission. Select it here and DOMINIC carries that context into processing, measurements, analysis, and delivery.
        </p>

        {error && <p style={{ color: V.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "grid", gap: 15 }}>
          <div>
            <label style={labelStyle}>DOM Mission *</label>
            {loadingJobs ? (
              <p style={{ color: V.inkFaint, fontSize: 13 }}>Loading eligible missions…</p>
            ) : jobs.length === 0 ? (
              <p style={{ color: V.inkFaint, fontSize: 13 }}>No eligible missions are available yet.</p>
            ) : (
              <select style={inputStyle} value={jobId} onChange={(e) => selectJob(e.target.value)}>
                <option value="">Select a mission…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} — {j.location ?? "no location"}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={labelStyle}>Project name *</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "North Roof — DOMINIC"' />
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={locationSnapshot} onChange={(e) => setLocationSnapshot(e.target.value)} placeholder="Pulled from the mission when available" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Latitude</label>
              <input style={inputStyle} value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Longitude</label>
              <input style={inputStyle} value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={create} disabled={saving} style={btnPrimary}>{saving ? "Creating…" : "Create DOMINIC Project"}</button>
            <button onClick={onCancel} style={btnGhost}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
