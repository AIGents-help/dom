"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";

interface Measurement {
  id: string;
  measurement_type: string;
  label: string | null;
  value: number;
  unit: string;
  created_at: string;
}

interface Markup {
  id: string;
  markup_type: string;
  label: string | null;
  tool_set: string;
  created_at: string;
}

interface ProjectPayload {
  project: {
    id: string;
    name: string;
    location_snapshot: string | null;
    latitude: number | null;
    longitude: number | null;
    image_count: number;
    processing_completed_at: string | null;
    job: { id: string; title: string; location: string | null; status: string } | null;
  };
  deliverables: Array<{
    id: string;
    name: string;
    type: string | null;
    qc_passed: boolean | null;
    client_status?: string | null;
    client_feedback?: string | null;
    client_reviewed_at?: string | null;
    delivered_at: string | null;
  }>;
}

export default function DominicReport({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [markups, setMarkups] = useState<Markup[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.replace("/pilot/login");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const [projectRes, measurementRes, markupRes] = await Promise.all([
        fetch(`/api/pilot/mapping/projects/${projectId}`, { headers }),
        fetch(`/api/pilot/mapping/projects/${projectId}/measurements`, { headers }),
        fetch(`/api/pilot/mapping/projects/${projectId}/markups`, { headers }),
      ]);

      const [projectBody, measurementBody, markupBody] = await Promise.all([
        projectRes.json().catch(() => ({})),
        measurementRes.json().catch(() => ({})),
        markupRes.json().catch(() => ({})),
      ]);

      if (!active) return;
      if (!projectRes.ok) {
        setError(projectBody.error ?? "Could not load this DOMINIC report.");
        return;
      }
      setData(projectBody);
      setMeasurements(measurementRes.ok ? measurementBody.measurements ?? [] : []);
      setMarkups(markupRes.ok ? markupBody.markups ?? [] : []);
    })();

    return () => { active = false; };
  }, [projectId, router]);

  if (error) return <div style={{ minHeight: "100vh", background: "#090D11", color: "#F05A5A", padding: 32 }}>{error}</div>;
  if (!data) return <div style={{ minHeight: "100vh", background: "#090D11", color: "#B2BCC7", padding: 32 }}>Preparing report…</div>;

  const project = data.project;
  const passed = data.deliverables.filter((item) => item.qc_passed).length;
  const approved = data.deliverables.filter((item) => item.client_status === "approved").length;
  const revisions = data.deliverables.filter((item) => item.client_status === "revision_requested").length;

  return (
    <div style={{ minHeight: "100vh", background: "#E9EDF1", padding: "24px 16px", color: "#172033" }}>
      <style>{`@media print { .dominic-report-actions { display:none !important; } body { background:#fff !important; } }`}</style>
      <div className="dominic-report-actions" style={{ maxWidth: 980, margin: "0 auto 12px", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button onClick={() => router.push("/dominic")} style={actionStyle}><ArrowLeft size={15} /> Back to DOMINIC</button>
        <button onClick={() => window.print()} style={{ ...actionStyle, background: "#F45A1E", borderColor: "#F45A1E", color: "#fff" }}><Printer size={15} /> Print / Save PDF</button>
      </div>

      <main style={{ position: "relative", maxWidth: 980, margin: "0 auto", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 70px rgba(0,0,0,.12)" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ transform: "rotate(-32deg)", fontSize: 82, fontWeight: 950, letterSpacing: ".08em", color: "rgba(244,90,30,.035)", whiteSpace: "nowrap" }}>DOMINIC · DRONE OPERATION MANAGEMENT</div>
        </div>
        <header style={{ position: "relative", zIndex: 1, background: "#090D11", color: "#fff", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div>
              <DominicBrandLockup size="sm" />
              <div style={{ fontSize: 9, marginTop: 6, color: "#F45A1E", fontWeight: 800 }}>UNIQUELY SOPHISTICATED</div>
            </div>
            <h1 style={{ margin: "24px 0 0", fontSize: 30 }}>{project.name}</h1>
            <p style={{ margin: "6px 0 0", color: "#BAC4CE" }}>{project.job?.title ?? "DOM Mission"} · {project.location_snapshot ?? project.job?.location ?? "Location not supplied"}</p>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#BAC4CE" }}>
            <div>DOMINIC Project Report</div>
            <div style={{ marginTop: 4 }}>{new Date().toLocaleDateString()}</div>
          </div>
        </header>

        <section style={{ position: "relative", zIndex: 1, padding: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 26 }}>
            <Metric label="Source Images" value={String(project.image_count)} />
            <Metric label="Measurements" value={String(measurements.length)} />
            <Metric label="Findings / Markups" value={String(markups.length)} />
            <Metric label="QC-Passed Outputs" value={`${passed}/${data.deliverables.length}`} />
            <Metric label="Client Approved" value={`${approved}/${passed}`} />
          </div>

          <SectionTitle>Project Summary</SectionTitle>
          <table style={tableStyle}>
            <tbody>
              <Row k="Mission" v={project.job?.title ?? "—"} />
              <Row k="Location" v={project.location_snapshot ?? project.job?.location ?? "—"} />
              <Row k="Coordinates" v={project.latitude != null && project.longitude != null ? `${project.latitude.toFixed(6)}, ${project.longitude.toFixed(6)}` : "—"} />
              <Row k="Processing completed" v={project.processing_completed_at ? new Date(project.processing_completed_at).toLocaleString() : "—"} />
            </tbody>
          </table>

          <SectionTitle>Measurements</SectionTitle>
          {measurements.length === 0 ? <Empty>No saved measurements.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Type</Th><Th>Label</Th><Th>Value</Th></tr></thead>
              <tbody>{measurements.map((item) => (
                <tr key={item.id}><Td>{titleCase(item.measurement_type)}</Td><Td>{item.label ?? "—"}</Td><Td>{formatValue(item.value)} {item.unit}</Td></tr>
              ))}</tbody>
            </table>
          )}

          <SectionTitle>Findings & Markups</SectionTitle>
          {markups.length === 0 ? <Empty>No saved findings or markups.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Type</Th><Th>Finding / Note</Th><Th>Tool Set</Th></tr></thead>
              <tbody>{markups.map((item) => (
                <tr key={item.id}><Td>{titleCase(item.markup_type)}</Td><Td>{item.label ?? "Unlabeled markup"}</Td><Td>{item.tool_set}</Td></tr>
              ))}</tbody>
            </table>
          )}

          <SectionTitle>Deliverables</SectionTitle>
          {data.deliverables.length === 0 ? <Empty>No processed deliverables registered.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Deliverable</Th><Th>Type</Th><Th>QC</Th><Th>Client Review</Th></tr></thead>
              <tbody>{data.deliverables.map((item) => (
                <tr key={item.id}><Td>{item.name}</Td><Td>{titleCase(item.type ?? "output")}</Td><Td>{item.qc_passed ? "Passed" : "Pending"}</Td><Td>{item.client_status ? titleCase(item.client_status) : item.qc_passed ? "Awaiting Review" : "—"}</Td></tr>
              ))}</tbody>
            </table>
          )}

          {revisions > 0 ? (
            <>
              <SectionTitle>Client Revision Requests</SectionTitle>
              <table style={tableStyle}>
                <thead><tr><Th>Deliverable</Th><Th>Client Instructions</Th><Th>Reviewed</Th></tr></thead>
                <tbody>{data.deliverables.filter((item) => item.client_status === "revision_requested").map((item) => (
                  <tr key={item.id}><Td>{item.name}</Td><Td>{item.client_feedback ?? "Revision requested"}</Td><Td>{item.client_reviewed_at ? new Date(item.client_reviewed_at).toLocaleString() : "—"}</Td></tr>
                ))}</tbody>
              </table>
            </>
          ) : null}

          <div style={{ marginTop: 30, paddingTop: 18, borderTop: "1px solid #D9E0E6", color: "#697584", fontSize: 10, lineHeight: 1.5 }}>
            DOMINIC™ · Drone Operation Management · Uniquely Sophisticated · DroneOpsMan.com · Project ID {project.id}. Generated by DOMINIC — Intelligent Mapping by DOM. Measurements and mapping outputs reflect the project data available at the time this report was generated. Survey-grade use depends on capture method, control, coordinate reference system, validation, and applicable professional requirements.
          </div>
        </section>
      </main>
    </div>
  );
}

const actionStyle = { border: "1px solid #34404C", background: "#10161D", color: "#F5F7FA", borderRadius: 9, padding: "9px 12px", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontWeight: 750 } as const;
const tableStyle = { width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 12 } as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: "24px 0 9px", fontSize: 16, borderBottom: "2px solid #F45A1E", paddingBottom: 6 }}>{children}</h2>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ border: "1px solid #D9E0E6", borderRadius: 10, padding: 12 }}><div style={{ fontSize: 21, fontWeight: 900 }}>{value}</div><div style={{ marginTop: 2, fontSize: 9, color: "#697584", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div></div>;
}
function Row({ k, v }: { k: string; v: string }) { return <tr><Td strong>{k}</Td><Td>{v}</Td></tr>; }
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: "left", padding: "8px 9px", background: "#F3F6F8", borderBottom: "1px solid #D9E0E6", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>{children}</th>; }
function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ padding: "8px 9px", borderBottom: "1px solid #E5E9ED", fontWeight: strong ? 800 : 400 }}>{children}</td>; }
function Empty({ children }: { children: React.ReactNode }) { return <p style={{ color: "#697584", fontSize: 12, marginBottom: 24 }}>{children}</p>; }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatValue(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(2); }
