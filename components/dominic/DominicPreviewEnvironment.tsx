"use client";

import { Activity, Aperture, BrainCircuit, Crosshair, Layers3, Radar, Satellite, ScanSearch, Sparkles, Waypoints } from "lucide-react";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

const ORANGE = "#F45A1E";
const LINE = "#25303B";
const TEXT = "#F5F7FA";
const MUTED = "#8F9CAA";

const configs = {
  "Live Flight": {
    eyebrow: "DOMINIC LIVE",
    title: "Real-Time Flight Operations",
    copy: "A preview of the live command environment planned for connected aircraft, telemetry, video and mission awareness.",
    status: "Flight connection not yet enabled",
    metrics: [["ALT", "124 ft"], ["SPD", "18.4 mph"], ["BAT", "78%"], ["RTK", "FIX"]],
    features: [
      ["Live Telemetry", "Aircraft position, heading, altitude, speed and battery.", Satellite],
      ["Mission Path", "Planned route, live track and coverage awareness.", Waypoints],
      ["Live Camera", "Low-latency field video with future AI overlays.", Aperture],
      ["Operational Alerts", "Coverage, battery and mission-condition guidance.", Radar],
    ],
  },
  "AR View": {
    eyebrow: "DOMINIC AR",
    title: "Augmented Reality Mission View",
    copy: "Preview the interface where DOMINIC will place mission intelligence directly over the live camera view.",
    status: "AR camera pipeline coming soon",
    metrics: [["TARGET", "B-07"], ["RANGE", "42 ft"], ["LAYER", "SITE"], ["LOCK", "READY"]],
    features: [
      ["Asset Labels", "Place names, IDs and inspection history into the scene.", Crosshair],
      ["Previous Findings", "Revisit exact defects, notes and inspection targets.", ScanSearch],
      ["Spatial Layers", "Property, site, waypoint and digital-twin overlays.", Layers3],
      ["Change Detection", "Compare the live view with prior mission data.", Sparkles],
    ],
  },
  "AI Copilot": {
    eyebrow: "DOMINIC INTELLIGENCE",
    title: "AI Flight Copilot",
    copy: "A preview of the assistant planned to combine imagery, telemetry and mission context while the pilot remains in control.",
    status: "Advisory intelligence preview",
    metrics: [["COVERAGE", "82%"], ["IMAGES", "146"], ["ISSUES", "3"], ["MODE", "ADVISE"]],
    features: [
      ["Capture Guidance", "Recommend position, angle and missing coverage.", BrainCircuit],
      ["Visual Detection", "Surface objects, anomalies and inspection candidates.", ScanSearch],
      ["Mission Awareness", "Connect current flight data with project requirements.", Radar],
      ["Pilot Assistance", "Contextual recommendations without replacing pilot authority.", Activity],
    ],
  },
} as const;

export default function DominicPreviewEnvironment({ module }: { module: keyof typeof configs }) {
  const config = configs[module];
  return (
    <div style={{ minHeight: 650, background: "radial-gradient(circle at 70% 15%, rgba(244,90,30,.16), transparent 30%), #0B1117", color: TEXT, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: `1px solid ${LINE}`, background: "rgba(10,15,20,.9)" }}>
        <div>
          <div style={{ color: ORANGE, fontSize: 10, fontWeight: 900, letterSpacing: ".16em" }}>{config.eyebrow}</div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 4 }}>{config.title}</div>
        </div>
        <div style={{ border: "1px solid rgba(244,90,30,.4)", background: "rgba(244,90,30,.1)", color: "#FF9A70", borderRadius: 999, padding: "7px 10px", fontSize: 10, fontWeight: 900, letterSpacing: ".1em" }}>COMING SOON · PREVIEW</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(280px,.8fr)", gap: 14, padding: 14 }}>
        <section style={{ border: `1px solid ${LINE}`, borderRadius: 12, minHeight: 360, position: "relative", overflow: "hidden", background: "linear-gradient(135deg,#151D25,#0B1015)" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .45, backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
          <div style={{ position: "absolute", left: 18, top: 18, display: "grid", gridTemplateColumns: "repeat(4,minmax(72px,1fr))", gap: 7, right: 18 }}>
            {config.metrics.map(([label,value]) => <div key={label} style={{ border: `1px solid ${LINE}`, borderRadius: 8, background: "rgba(8,13,18,.78)", padding: "8px 10px" }}><div style={{ color: MUTED, fontSize: 8, fontWeight: 800 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{value}</div></div>)}
          </div>
          <div style={{ position: "absolute", inset: "80px 16px 16px", border: "1px dashed rgba(244,90,30,.26)", borderRadius: 10 }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 120, height: 120, transform: "translate(-50%,-50%)", border: "1px solid rgba(244,90,30,.45)", borderRadius: "50%" }} />
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, transform: "translate(-50%,-50%)", background: ORANGE, borderRadius: "50%", boxShadow: "0 0 22px rgba(244,90,30,.7)" }} />
            <div style={{ position: "absolute", left: 16, bottom: 14, color: MUTED, fontSize: 10 }}>{config.status}</div>
          </div>
        </section>

        <aside style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#111820", overflow: "hidden", position: "relative", minHeight: 360 }}>
          <div style={{ position: "relative", height: 250 }}>
            <DominicMascotImage className="object-contain object-bottom p-2" />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 50%,#111820 100%)" }} />
            <div style={{ position: "absolute", left: 14, bottom: 10, right: 14 }}>
              <div style={{ color: ORANGE, fontSize: 10, fontWeight: 900, letterSpacing: ".12em" }}>DOMINIC IS BUILDING THIS</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>Your next workspace is taking shape.</div>
            </div>
          </div>
          <div style={{ padding: "8px 14px 16px", color: MUTED, fontSize: 12, lineHeight: 1.55 }}>{config.copy}</div>
        </aside>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, padding: "0 14px 14px" }}>
        {config.features.map(([title,copy,Icon]) => <div key={title} style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#10161D", padding: 12 }}><Icon size={19} color={ORANGE}/><div style={{ fontWeight: 900, marginTop: 10, fontSize: 13 }}>{title}</div><div style={{ color: MUTED, fontSize: 10, lineHeight: 1.45, marginTop: 5 }}>{copy}</div></div>)}
      </div>
    </div>
  );
}
