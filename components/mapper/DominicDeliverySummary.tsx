"use client";

import { Download, FileText, PackageCheck } from "lucide-react";
import { V, panelStyle } from "./theme";
import type { MappingDeliverable } from "./types";

function labelFor(type: string | null) {
  if (!type) return "Output";
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DominicDeliverySummary({ deliverables }: { deliverables: MappingDeliverable[] }) {
  const qcPassed = deliverables.filter((item) => item.qc_passed).length;
  const pending = deliverables.length - qcPassed;
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
          <Stat value={pending} label="Pending" />
        </div>
      </div>

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
        <Roadmap icon={FileText} title="Annotated Report" copy="Measurements, findings, notes and map imagery in a client-ready report." />
        <Roadmap icon={PackageCheck} title="Delivery Bundle" copy="One packaged download containing the approved mission deliverables." />
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

function Roadmap({ icon: Icon, title, copy, live = false }: { icon: typeof FileText; title: string; copy: string; live?: boolean }) {
  return (
    <div style={{ border: `1px solid ${V.line}`, borderRadius: 9, padding: 11, background: "#0B1117" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Icon size={15} color={V.signal} />
        <span className="font-mono-ibm" style={{ color: live ? V.telemetry : V.inkFaint, fontSize: 8 }}>{live ? "LIVE" : "NEXT"}</span>
      </div>
      <div style={{ color: V.ink, fontSize: 12, fontWeight: 800, marginTop: 8 }}>{title}</div>
      <div style={{ color: V.inkFaint, fontSize: 10, lineHeight: 1.45, marginTop: 4 }}>{copy}</div>
    </div>
  );
}
