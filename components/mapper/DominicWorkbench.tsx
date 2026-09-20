"use client";

import { useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  Cloud,
  Crosshair,
  Layers3,
  Map,
  MapPin,
  MessageSquareText,
  MousePointer2,
  Pentagon,
  Ruler,
  Sparkles,
  Square,
  Type,
} from "lucide-react";
import { V } from "./theme";
import MappingResults from "./MappingResults";
import type { MappingDeliverable } from "./types";
import type { DominicWorkbenchTool } from "./workbenchTypes";

const tools: Array<{ id: DominicWorkbenchTool; label: string; icon: typeof MousePointer2; live?: boolean }> = [
  { id: "select", label: "Select", icon: MousePointer2, live: true },
  { id: "distance", label: "Distance", icon: Ruler, live: true },
  { id: "area", label: "Area", icon: Pentagon, live: true },
  { id: "note", label: "Note", icon: Type, live: true },
  { id: "callout", label: "Callout", icon: MessageSquareText, live: true },
  { id: "pin", label: "Issue Pin", icon: MapPin, live: true },
  { id: "cloud", label: "Cloud", icon: Cloud, live: true },
  { id: "shape", label: "Shape", icon: Square, live: true },
];

const layerTypes = [
  { label: "Orthomosaic", types: ["orthomosaic"] },
  { label: "DSM", types: ["dsm", "dem"] },
  { label: "DTM", types: ["dtm"] },
  { label: "Contours", types: ["contours"] },
  { label: "3D Model", types: ["3d_model"] },
  { label: "Point Cloud", types: ["point_cloud"] },
];

export default function DominicWorkbench({
  deliverables,
  accessToken,
  projectId,
}: {
  deliverables: MappingDeliverable[];
  accessToken: string;
  projectId: string;
}) {
  const [activeTool, setActiveTool] = useState<DominicWorkbenchTool>("select");
  const [toolSet, setToolSet] = useState("General");
  const [layersOpen, setLayersOpen] = useState(true);
  const [requestedLayer, setRequestedLayer] = useState<string | null>(null);

  const available = useMemo(() => {
    const types = new Set(deliverables.map((d) => d.type).filter(Boolean));
    return layerTypes.map((layer) => ({ ...layer, ready: layer.types.some((type) => types.has(type)) }));
  }, [deliverables]);

  return (
    <div style={{ border: `1px solid ${V.line}`, borderRadius: 12, overflow: "hidden", background: "#070B0F", boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) 220px", minHeight: 540 }}>
        <aside style={{ borderRight: `1px solid ${V.line}`, background: "#0B1016", padding: "10px 7px", display: "grid", alignContent: "start", gap: 5 }}>
          {tools.map(({ id, label, icon: Icon, live }) => {
            const active = activeTool === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTool(id)}
                title={live ? label : `${label} — coming soon`}
                style={{
                  border: active ? `1px solid ${V.signal}` : "1px solid transparent",
                  background: active ? "rgba(244,90,30,.13)" : "transparent",
                  color: active ? V.signal : V.inkDim,
                  borderRadius: 9,
                  padding: "8px 3px",
                  display: "grid",
                  justifyItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  fontSize: 9,
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </aside>

        <main style={{ minWidth: 0, background: "#080C10", padding: 10 }}>
          <div style={{ minHeight: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: V.inkDim, fontSize: 11 }}>
              <Crosshair size={14} color={V.signal} />
              <span>{activeTool === "select" ? "Navigate the map" : `${tools.find((tool) => tool.id === activeTool)?.label} tool selected`}</span>
            </div>
            <select
              value={toolSet}
              onChange={(event) => setToolSet(event.target.value)}
              style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.ink, borderRadius: 8, padding: "6px 9px", fontSize: 11 }}
              aria-label="Markup tool set"
            >
              {["General", "Roof", "Solar", "Construction", "Infrastructure", "Property", "Thermal"].map((set) => <option key={set}>{set}</option>)}
            </select>
          </div>
          <MappingResults deliverables={deliverables} accessToken={accessToken} projectId={projectId} workbenchTool={activeTool} toolSet={toolSet} requestedLayer={requestedLayer} />
        </main>

        <aside style={{ borderLeft: `1px solid ${V.line}`, background: "#0B1016", padding: 12 }}>
          <button
            onClick={() => setLayersOpen((open) => !open)}
            style={{ width: "100%", border: 0, background: "transparent", color: V.ink, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: 0 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800 }}>
              <Layers3 size={15} color={V.signal} /> Layers
            </span>
            <ChevronDown size={14} style={{ transform: layersOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
          </button>

          {layersOpen ? (
            <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
              {available.map((layer) => (
                <button
                  key={layer.label}
                  disabled={!layer.ready}
                  onClick={() => {
                    const layerType = layer.types.find((type) => deliverables.some((d) => d.type === type));
                    if (layerType) setRequestedLayer(layerType);
                  }}
                  style={{
                    border: requestedLayer && layer.types.includes(requestedLayer) ? `1px solid ${V.signal}` : "1px solid transparent",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "7px 8px",
                    borderRadius: 8,
                    background: layer.ready ? "#121922" : "transparent",
                    color: layer.ready ? V.ink : V.inkFaint,
                    fontSize: 11,
                    cursor: layer.ready ? "pointer" : "default",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {layer.label === "3D Model" ? <Box size={13} /> : <Map size={13} />}
                    {layer.label}
                  </span>
                  <span style={{ fontSize: 9, color: layer.ready ? V.telemetry : V.inkFaint }}>{layer.ready ? "READY" : "—"}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 14, paddingTop: 14 }}>
            <div style={{ color: V.inkFaint, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Tool Set</div>
            <div style={{ color: V.ink, fontSize: 13, fontWeight: 700 }}>{toolSet}</div>
            <p style={{ color: V.inkFaint, fontSize: 10, lineHeight: 1.45, marginTop: 5 }}>DOMINIC saves notes, callouts, issue pins and drawn regions to this project with the selected inspection workflow.</p>
          </div>

          <button
            disabled
            title="Automatic markup analysis is staged for a later build pass"
            style={{ width: "100%", marginTop: 14, border: `1px solid ${V.line}`, background: "rgba(244,90,30,.08)", color: V.inkDim, borderRadius: 9, padding: "9px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 11 }}
          >
            <Sparkles size={14} color={V.signal} /> Auto Markup
          </button>
        </aside>
      </div>
    </div>
  );
}
