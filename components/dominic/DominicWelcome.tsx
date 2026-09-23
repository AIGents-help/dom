"use client";

import Image from "next/image";
import heroImage from "@/components/dominic/assets/heroData";
import captureImage from "@/components/dominic/assets/captureData";
import projectsImage from "@/components/dominic/assets/projectsData";
import hubImage from "@/components/dominic/assets/hubData";
import liveImage from "@/components/dominic/assets/liveData";
import arImage from "@/components/dominic/assets/arData";
import aiImage from "@/components/dominic/assets/aiData";
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

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const PANEL = "#11171E";
const PANEL_2 = "#0B1117";
const LINE = "#2A3540";
const TEXT = "#F5F7FA";
const MUTED = "#96A2AE";
type DominicModuleCard = {
  module: "Capture Planner" | "Projects" | "DOMINIC HUB" | "Live Flight" | "AR View" | "AI Copilot";
  title: string;
  description: string;
  icon: typeof Crosshair;
  priority?: boolean;
  image: string;
};

const modules: DominicModuleCard[] = [
  {
    module: "Capture Planner",
    title: "Capture Planner",
    description: "Plan coverage, overlap, camera angles, checkpoints and safe capture paths before takeoff.",
    icon: Crosshair,
    priority: true,
    image: captureImage,
  },
  {
    module: "Projects",
    title: "Projects & Mapping",
    description: "Upload imagery, process maps and 3D models, measure, analyze and build deliverables.",
    icon: FolderKanban,
    image: projectsImage,
  },
  {
    module: "DOMINIC HUB",
    title: "DOMINIC HUB",
    description: "Mission planning, fleet management, live operations, sensors, alerts and simulation.",
    icon: Factory,
    image: hubImage,
  },
  {
    module: "Live Flight",
    title: "Live Flight",
    description: "Real-time aircraft view, telemetry, camera feed and mission monitoring.",
    icon: Activity,
    image: liveImage,
  },
  {
    module: "AR View",
    title: "AR View",
    description: "Augmented-reality overlays for field context, alignment and on-site validation.",
    icon: Box,
    image: arImage,
  },
  {
    module: "AI Copilot",
    title: "AI Copilot",
    description: "Mission guidance, checklists, analysis and contextual assistance inside DOMINIC.",
    icon: Sparkles,
    image: aiImage,
  },
];

function CardVisual({ src, title }: { src: string; title: string }) {
  return (
    <div style={{ position: "relative", aspectRatio: "228 / 127", borderBottom: "1px solid " + LINE, overflow: "hidden", background: "#0B1117" }}>
      <Image
        src={src}
        alt={title + " visual preview"}
        fill
        unoptimized
        sizes="(min-width: 1200px) 16vw, 33vw"
        style={{ objectFit: "cover" }}
      />
    </div>
  );
}

export default function DominicWelcome({ onOpen }: { onOpen: (module: string) => void }) {
  return (
    <div style={{ minHeight: 720, background: "#090E13", overflow: "hidden", border: "1px solid #202A34", boxShadow: "0 26px 90px rgba(0,0,0,.38)" }}>
      <section style={{ position: "relative", overflow: "hidden", background: "#0A0F14", borderBottom: "1px solid #202A34" }}>
        <Image
          src={heroImage}
          alt="DOMINIC preparing a professional drone in a refinery operations environment"
          width={900}
          height={237}
          priority
          unoptimized
          sizes="100vw"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
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
                <CardVisual src={item.image} title={item.title} />
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
