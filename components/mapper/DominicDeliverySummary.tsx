"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileText, PackageCheck } from "lucide-react";
import { V, panelStyle } from "./theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import type { MappingDeliverable } from "./types";

function labelFor(type: string | null) {
  if (!type) return "Output";
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DominicDeliverySummary({ deliverables, projectId }: { deliverables: MappingDeliverable[]; projectId: string }) {
  const router = useRouter();
  const [manifestBusy, setManifestBusy] = useState(false);

  async function downloadManifest() {
    setManifestBusy(true);
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/pilot/mapping/projects/${projectId}/delivery-manifest`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "DOMINIC_Delivery-Manifest.txt";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setManifestBusy(false);
    }
  }
  const qcPassed = deliverables.filter((item) => item.qc_passed).length;
  const pending = deliverables.length - qcPassed;
  const clientApproved = deliverables.filter((item) => item.client_status === "approved").length;
  const revisionRequested = deliverables.filter((item) => item.client_status === "revision_requested").length;
  const clientPending = deliverables.filter((item) => item.qc_passed && !["approved", "revision_requested"].includes(item.client_status ?? "")).length;
  const clientReviewed = clientApproved + revisionRequested;
  const handoffComplete = qcPassed > 0 && clientApproved === qcPassed;
  const categories = new Set(deliverables.map((item) => item.type).filter(Boolean));

  return (
    <section style={{ ...panelStyle, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="font-mono-ibm" style={{ fontSize: 10, color: V.inkFaint, letterSpacing: ".09em", textTransform: "uppercase" }}>Delivery Package</div>
          <h3 style={{ margin: "5px 0 0", color: V.ink, fontSize: 17 }}>Project outputs, organized for handoff.</h3>
          <p style={{ margin: "5px 0 0", color: V.inkDim, fontSize: 11, maxWidth: 520, lineHeight: 1.5 }}>
            DOMINIC keeps mapping, elevation, CAD/GIS and model outputs attached to the same mission so QC and client delivery can happen from one workspace.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Stat value={deliverables.length} label="Outputs" />
          <Stat value={qcPassed} label="QC Passed" />
          <Stat value={pending} label="Pending QC" />
          <Stat value={clientApproved} label="Client Approved" />
          <Stat value={revisionRequested} label="Revision" />
        </div>
      </div>

      {qcPassed > 0 ? (
        <div style={{ marginTop: 13, border: `1px solid ${revisionRequested ? V.warn : V.line}`, borderRadius: 10, padding: 11, background: "#0B1117" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div className="font-mono-ibm" style={{ color: V.inkFaint, fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" }}>Client Handoff</div>
            <span className="font-mono-ibm" style={{ color: handoffComplete ? V.telemetry : revisionRequested ? V.warn : V.inkDim, fontSize: 9 }}>
              {handoffComplete ? "HANDOFF COMPLETE" : revisionRequested ? "ACTION REQUIRED" : clientReviewed > 0 ? "IN REVIEW" : "AWAITING REVIEW"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 7, fontSize: 11 }}>
            <span style={{ color: V.inkDim }}>{clientPending} awaiting client review</span>
            <span style={{ color: V.telemetry }}>{clientApproved} approved</span>
            {revisionRequested > 0 ? <span style={{ color: V.warn }}>{revisionRequested} revision requested</span> : null}
          </div>
          <div style={{ marginTop: 9, height: 4, borderRadius: 999, background: V.line, overflow: "hidden" }}>
            <div style={{ width: `${qcPassed ? Math.round((clientReviewed / qcPassed) * 100) : 0}%`, height: "100%", background: handoffComplete ? V.telemetry : revisionRequested ? V.warn : V.signal }} />
          </div>
          {revisionRequested > 0 ? (
            <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
              {deliverables.filter((item) => item.client_status === "revision_requested").map((item) => (
                <div key={item.id} style={{ borderTop: `1px solid ${V.lineSoft}`, paddingTop: 7 }}>
                  <strong style={{ color: V.ink, fontSize: 11 }}>{item.name}</strong>
                  <div style={{ color: V.warn, fontSize: 10, marginTop: 2 }}>{item.client_feedback || "Client requested a revision."}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {categories.size > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 13 }}>
          {[...categories].map((type) => (
            <span key={type as string} style={{ border: `1px solid ${V.line}`, borderRadius: 999, padding: "5px 8px", color: V.inkDim, fontSize: 9 }}>
              {labelFor(type as string)}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8, marginTop: 14 }}>
        <Roadmap icon={FileText} title="Project Report" copy="Measurements, findings, project details and deliverables in a client-ready printable report." live onClick={() => router.push(`/dominic/report/${projectId}`)} />
        <Roadmap icon={PackageCheck} title="Delivery Manifest" copy="Branded handoff manifest containing only QC-approved outputs and fresh secure download links." live onClick={downloadManifest} status={manifestBusy ? "PREPARING" : "LIVE"} />
        <Roadmap icon={Download} title="Direct Exports" copy="GeoTIFF, GIS, CAD, point-cloud and model files stay individually downloadable." live />
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ minWidth: 72, border: `1px solid ${V.line}`, borderRadius: 9, padding: "7px 9px", background: "#0B1117" }}>
      <div style={{ color: V.ink, fontSize: 16, fontWeight: 850 }}>{value}</div>
      <div className="font-mono-ibm" style={{ color: V.inkFaint, fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    </div>
  );
}

function Roadmap({ icon: Icon, title, copy, live = false, onClick, status }: { icon: typeof FileText; title: string; copy: string; live?: boolean; onClick?: () => void; status?: string }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{ width: "100%", border: `1px solid ${V.line}`, borderRadius: 9, padding: 11, background: "#0B1117", textAlign: "left", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Icon size={15} color={V.signal} />
        <span className="font-mono-ibm" style={{ color: live ? V.telemetry : V.inkFaint, fontSize: 8 }}>{status ?? (live ? "LIVE" : "NEXT")}</span>
      </div>
      <div style={{ color: V.ink, fontSize: 12, fontWeight: 800, marginTop: 8 }}>{title}</div>
      <div style={{ color: V.inkFaint, fontSize: 10, lineHeight: 1.45, marginTop: 4 }}>{copy}</div>
    </button>
  );
}
