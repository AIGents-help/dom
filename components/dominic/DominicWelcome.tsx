"use client";

import {
  Activity,
  ArrowRight,
  Box,
  Crosshair,
  Factory,
  FolderKanban,
  Sparkles,
  CircleHelp,
  GraduationCap,
} from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const PANEL = "#11171E";
const PANEL_2 = "#0B1117";
const LINE = "#2A3540";
const TEXT = "#F5F7FA";
const MUTED = "#96A2AE";
const SPRITE = "/brand/dominic-approved-mockup.webp";
const SPRITE_W = 1774;
const SPRITE_H = 887;

type Crop = { x: number; y: number; w: number; h: number };
type DominicModuleCard = {
  module: "Capture Planner" | "Projects" | "DOMINIC HUB" | "Live Flight" | "AR View" | "AI Copilot";
  title: string;
  description: string;
  icon: typeof Crosshair;
  priority?: boolean;
  crop: Crop;
};

const HERO: Crop = { x: 470, y: 70, w: 1040, h: 400 };

const modules: DominicModuleCard[] = [
  {
    module: "Capture Planner",
    title: "Capture Planner",
    description: "Plan coverage, overlap, camera angles, checkpoints and safe capture paths before takeoff.",
    icon: Crosshair,
    priority: true,
    crop: { x: 240, y: 485, w: 228, h: 127 },
  },
  {
    module: "Projects",
    title: "Projects & Mapping",
    description: "Upload imagery, process maps and 3D models, measure, analyze and build deliverables.",
    icon: FolderKanban,
    crop: { x: 490, y: 485, w: 224, h: 127 },
  },
  {
    module: "DOMINIC HUB",
    title: "DOMINIC HUB",
    description: "Mission planning, fleet management, live operations, sensors, alerts and simulation.",
    icon: Factory,
    crop: { x: 732, y: 485, w: 226, h: 127 },
  },
  {
    module: "Live Flight",
    title: "Live Flight",
    description: "Real-time aircraft view, telemetry, camera feed and mission monitoring.",
    icon: Activity,
    crop: { x: 980, y: 485, w: 227, h: 127 },
  },
  {
    module: "AR View",
    title: "AR View",
    description: "Augmented-reality overlays for field context, alignment and on-site validation.",
    icon: Box,
    crop: { x: 1227, y: 485, w: 226, h: 127 },
  },
  {
    module: "AI Copilot",
    title: "AI Copilot",
    description: "Mission guidance, checklists, analysis and contextual assistance inside DOMINIC.",
    icon: Sparkles,
    crop: { x: 1475, y: 485, w: 230, h: 127 },
  },
];

function spriteCrop(crop: Crop): React.CSSProperties {
  const px = crop.x === 0 ? 0 : (crop.x / (SPRITE_W - crop.w)) * 100;
  const py = crop.y === 0 ? 0 : (crop.y / (SPRITE_H - crop.h)) * 100;
  return {
    backgroundImage: `url("${SPRITE}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${(SPRITE_W / crop.w) * 100}% ${(SPRITE_H / crop.h) * 100}%`,
    backgroundPosition: `${px}% ${py}%`,
  };
}

function CardVisual({ crop }: { crop: Crop }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 126,
        borderBottom: "1px solid " + LINE,
        backgroundColor: "#0B1117",
        ...spriteCrop(crop),
      }}
    />
  );
}

export default function DominicWelcome({ onOpen }: { onOpen: (module: string) => void }) {
  return (
    <div style={{ minHeight: 720, background: "#090E13", overflow: "hidden", border: "1px solid #202A34", boxShadow: "0 26px 90px rgba(0,0,0,.38)" }}>
      <section
        style={{
          position: "relative",
          minHeight: 400,
          overflow: "hidden",
          background: "#0A0F14",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "27%",
            right: "12%",
            top: 0,
            bottom: 0,
            ...spriteCrop(HERO),
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg,#090E13 0%,rgba(9,14,19,.96) 21%,rgba(9,14,19,.35) 33%,rgba(9,14,19,0) 48%,rgba(9,14,19,.04) 72%,rgba(9,14,19,.76) 100%),linear-gradient(180deg,rgba(9,14,19,.02) 63%,#090E13 100%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "absolute", left: "4.2%", top: 38, zIndex: 3, width: "28%", minWidth: 300 }}>
          <div style={{ color: ORANGE, fontSize: 11, fontWeight: 950, letterSpacing: ".19em", textTransform: "uppercase" }}>Welcome to</div>
          <div style={{ marginTop: 12 }}><DominicBrandLockup size="lg" showTagline /></div>
          <p style={{ color: "#D0D7DE", fontSize: 15, lineHeight: 1.55, margin: "23px 0 0", maxWidth: 375 }}>
            Turn images into intelligence.<br />Plan, fly, map, analyze and deliver —<br />all in one workspace.
          </p>
          <div style={{ marginTop: 22, color: "#F5F7FA", fontSize: 19, fontStyle: "italic", letterSpacing: ".02em" }}>
            Same skies. <span style={{ color: ORANGE }}>Smarter missions.</span>
          </div>
        </div>

        <div style={{ position: "absolute", right: "3.2%", top: 46, width: 210, zIndex: 3, display: "grid", gap: 9, color: "#E2E7EC", fontSize: 9, fontWeight: 850, letterSpacing: ".11em", textTransform: "uppercase" }}>
          {["Safer operations", "Higher accuracy", "Real insights", "Greater efficiency"].map((label) => (
            <div key={label} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 9, background: "rgba(6,11,16,.69)", border: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(6px)" }}>
              <span style={{ width: 22, height: 22, border: "1px solid rgba(255,255,255,.32)", borderRadius: "50%", display: "grid", placeItems: "center", color: ORANGE, fontSize: 13 }}>•</span>
              {label}
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "10px 12px 14px", background: "#090E13", borderTop: "1px solid #202A34" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 9 }}>
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.module}
                type="button"
                onClick={() => onOpen(item.module)}
                style={{
                  textAlign: "left",
                  border: item.priority ? "2px solid " + ORANGE : "1px solid " + LINE,
                  borderRadius: 11,
                  overflow: "hidden",
                  background: PANEL,
                  color: TEXT,
                  cursor: "pointer",
                  padding: 0,
                  minWidth: 0,
                  boxShadow: item.priority ? "0 0 0 1px rgba(244,90,30,.18),0 12px 28px rgba(244,90,30,.12)" : "none",
                }}
              >
                <CardVisual crop={item.crop} />
                <div style={{ padding: "12px 12px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: "50%", background: "rgba(244,90,30,.10)", border: "1px solid rgba(244,90,30,.25)" }}>
                      <Icon size={14} color={ORANGE} />
                    </div>
                    <strong style={{ fontSize: 13, lineHeight: 1.2 }}>{item.title}</strong>
                  </div>
                  <div style={{ color: "#AAB5BF", fontSize: 9, lineHeight: 1.5, marginTop: 9, minHeight: 55 }}>{item.description}</div>
                  <div style={{ marginTop: 11, border: item.priority ? "1px solid rgba(244,90,30,.8)" : "1px solid " + LINE, background: item.priority ? "linear-gradient(90deg," + ORANGE_DARK + "," + ORANGE + ")" : PANEL_2, color: item.priority ? "#160801" : TEXT, borderRadius: 7, padding: "8px 9px", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {"Open " + item.title.replace("Projects & Mapping", "Projects")} <ArrowRight size={12} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ margin: "0 12px 14px", minHeight: 76, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", border: "1px solid " + LINE, borderRadius: 11, background: "#11171E", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderRight: "1px solid " + LINE }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", background: "#202831" }}><GraduationCap size={19} color="#D8E0E7" /></div>
          <div><div style={{ fontSize: 11, fontWeight: 900 }}>New to DOMINIC?</div><div style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>Take a quick tour and start with Capture Planner.</div></div>
          <button onClick={() => onOpen("Capture Planner")} style={{ marginLeft: "auto", border: "1px solid " + ORANGE, background: "transparent", color: ORANGE, borderRadius: 7, padding: "8px 12px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}>Start Here</button>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderRight: "1px solid " + LINE }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", background: "#202831" }}><CircleHelp size={19} color="#D8E0E7" /></div>
          <div><div style={{ fontSize: 11, fontWeight: 900 }}>Need help?</div><div style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>Guides, tutorials and support resources.</div></div>
        </div>
        <div style={{ padding: "0 18px", display: "grid", placeItems: "center", color: "#7E8A96", fontSize: 8, fontWeight: 900, letterSpacing: ".22em", whiteSpace: "nowrap" }}>MAP · MEASURE · ANALYZE · DELIVER</div>
      </section>
    </div>
  );
}
