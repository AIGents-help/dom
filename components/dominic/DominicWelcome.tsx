"use client";

import {
  Activity,
  ArrowRight,
  Crosshair,
  Factory,
  FolderKanban,
  Layers3,
  Sparkles,
} from "lucide-react";
import DominicHomePresentingMascot from "@/components/dominic/DominicHomePresentingMascot";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const PANEL = "#10161D";
const PANEL_2 = "#0B1117";
const LINE = "#25303B";
const TEXT = "#F5F7FA";
const MUTED = "#8F9CAA";

const primary = [
  {
    module: "Capture Planner",
    title: "Capture Planner",
    eyebrow: "START HERE",
    description: "Plan coverage, overlap, camera angles, checkpoints and safe capture paths before takeoff.",
    icon: Crosshair,
    priority: true,
  },
  {
    module: "Projects",
    title: "Projects & Mapping",
    eyebrow: "PROCESS & DELIVER",
    description: "Upload imagery, process maps and 3D models, review results, measure and build deliverables.",
    icon: FolderKanban,
  },
  {
    module: "DOMINIC HUB",
    title: "DOMINIC HUB",
    eyebrow: "OPERATIONS",
    description: "Open the command center for routes, fleet, sensors, scheduling, alerts and mission simulation.",
    icon: Factory,
  },
];

const secondary = [
  {
    module: "Live Flight",
    title: "Live Flight",
    description: "Follow aircraft status and telemetry as DOMINIC live-flight capabilities come online.",
    icon: Activity,
  },
  {
    module: "AR View",
    title: "AR View",
    description: "Field overlays for capture guidance, alignment, coverage awareness and site context.",
    icon: Layers3,
  },
  {
    module: "AI Copilot",
    title: "AI Copilot",
    description: "Contextual mission assistance and guidance inside the DOMINIC workspace.",
    icon: Sparkles,
  },
];

function ModuleCard({
  item,
  onOpen,
}: {
  item: (typeof primary)[number];
  onOpen: (module: string) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.module)}
      style={{
        textAlign: "left",
        minHeight: 188,
        border: item.priority ? "1px solid rgba(244,90,30,.72)" : `1px solid ${LINE}`,
        borderRadius: 14,
        padding: 18,
        background: item.priority
          ? `linear-gradient(145deg, rgba(244,90,30,.19), rgba(11,17,23,.96) 58%), ${PANEL_2}`
          : `linear-gradient(145deg, rgba(255,255,255,.025), rgba(11,17,23,.96)), ${PANEL_2}`,
        color: TEXT,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        boxShadow: item.priority ? "0 18px 45px rgba(0,0,0,.28)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: item.priority ? `linear-gradient(135deg,${ORANGE_DARK},${ORANGE})` : "rgba(244,90,30,.10)",
            border: item.priority ? 0 : "1px solid rgba(244,90,30,.26)",
          }}
        >
          <Icon size={22} color={item.priority ? "#180A02" : ORANGE} />
        </div>
        <span style={{ color: item.priority ? "#FFAA86" : MUTED, fontSize: 9, fontWeight: 900, letterSpacing: ".12em" }}>
          {item.eyebrow}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 950, marginTop: 18 }}>{item.title}</div>
      <div style={{ color: "#B5BEC7", fontSize: 11, lineHeight: 1.55, marginTop: 7, maxWidth: 360 }}>
        {item.description}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: ORANGE, marginTop: 16, fontSize: 10, fontWeight: 900 }}>
        Open <ArrowRight size={14} />
      </div>
    </button>
  );
}

export default function DominicWelcome({ onOpen }: { onOpen: (module: string) => void }) {
  return (
    <div
      style={{
        minHeight: 680,
        background: `radial-gradient(circle at 22% 20%, rgba(244,90,30,.13), transparent 28%), ${PANEL}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px,.72fr) minmax(0,1.28fr)",
          gap: 18,
          padding: "24px 24px 8px",
          alignItems: "end",
        }}
      >
        <div style={{ minHeight: 300, position: "relative", overflow: "hidden", display: "grid", alignItems: "end" }}>
          <DominicHomePresentingMascot />
        </div>

        <div style={{ padding: "10px 0 28px" }}>
          <div style={{ color: ORANGE, fontWeight: 950, fontSize: 10, letterSpacing: ".18em" }}>DOMINIC HOME</div>
          <h1 style={{ margin: "8px 0 0", fontSize: "clamp(28px,4vw,48px)", lineHeight: 1.02, letterSpacing: "-.035em" }}>
            What do you want to do?
          </h1>
          <p style={{ color: "#B8C1CA", fontSize: 13, lineHeight: 1.65, maxWidth: 650, margin: "12px 0 0" }}>
            DOMINIC brings planning, flight, mapping and operations into one workspace. Start with the task that matches your mission.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 18 }}>
            {["01 PLAN", "02 FLY", "03 PROCESS", "04 DELIVER"].map((step) => (
              <span key={step} style={{ border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 9px", color: MUTED, fontSize: 9, fontWeight: 900, letterSpacing: ".07em" }}>
                {step}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ color: MUTED, fontSize: 9, fontWeight: 900, letterSpacing: ".14em", margin: "0 2px 9px" }}>
          PRIMARY WORKSPACES
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(235px,1fr))", gap: 10 }}>
          {primary.map((item) => <ModuleCard key={item.module} item={item} onOpen={onOpen} />)}
        </div>

        <div style={{ color: MUTED, fontSize: 9, fontWeight: 900, letterSpacing: ".14em", margin: "20px 2px 9px" }}>
          NEXT-GENERATION TOOLS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 9 }}>
          {secondary.map(({ module, title, description, icon: Icon }) => (
            <button
              key={module}
              type="button"
              onClick={() => onOpen(module)}
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 12,
                background: PANEL_2,
                color: TEXT,
                padding: 14,
                textAlign: "left",
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: "36px minmax(0,1fr) 18px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(244,90,30,.08)" }}>
                <Icon size={17} color={ORANGE} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <strong style={{ fontSize: 12 }}>{title}</strong>
                  <span style={{ border: "1px solid rgba(244,90,30,.26)", borderRadius: 999, padding: "2px 5px", color: "#FF9A70", fontSize: 7, fontWeight: 900 }}>
                    PREVIEW
                  </span>
                </div>
                <div style={{ color: MUTED, fontSize: 9, lineHeight: 1.45, marginTop: 4 }}>{description}</div>
              </div>
              <ArrowRight size={15} color={ORANGE} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
