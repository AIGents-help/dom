"use client";

import { useEffect, useState } from "react";
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
      setJobs(res.ok ? (body.jobs ?? []) : []);
      setLoadingJobs(false);
    })();
  }, [accessToken]);

  useEffect(() => {
    const job = jobs.find((j) => j.id === jobId);
    if (job && !locationSnapshot) setLocationSnapshot(job.location ?? "");
    if (job && !name) setName(`${job.title} — Mapping`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function create() {
    if (!jobId) { setError("Select a job first."); return; }
    if (!name.trim()) { setError("Name is required."); return; }
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
    if (!res.ok) { setError(body.error ?? "Could not create the mapping project."); return; }
    onCreated(body.project.id);
  }

  return (
    <div style={panelStyle}>
      <div className="font-saira" style={{ fontWeight: 600, fontSize: 16, color: V.ink, marginBottom: 4 }}>New Mapping Project</div>
      <p style={{ color: V.inkDim, fontSize: 13, marginBottom: 16 }}>
        Attach a mapping project to a job you have an accepted assignment on.
      </p>

      {error && <p style={{ color: V.signal, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={labelStyle}>Job *</label>
          {loadingJobs ? (
            <p style={{ color: V.inkFaint, fontSize: 13 }}>Loading eligible jobs…</p>
          ) : jobs.length === 0 ? (
            <p style={{ color: V.inkFaint, fontSize: 13 }}>No accepted assignments to attach a mapping project to yet.</p>
          ) : (
            <select style={inputStyle} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title} — {j.location ?? "no location"}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label style={labelStyle}>Project name *</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "North Roof — Orthomosaic"' />
        </div>

        <div>
          <label style={labelStyle}>Location</label>
          <input style={inputStyle} value={locationSnapshot} onChange={(e) => setLocationSnapshot(e.target.value)} placeholder="Prefilled from the job when available" />
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
          <button onClick={create} disabled={saving} style={btnPrimary}>{saving ? "Creating…" : "Create Project"}</button>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
