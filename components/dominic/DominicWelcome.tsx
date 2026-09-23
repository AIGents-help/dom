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
import DominicMascotImage from "@/components/dominic/DominicMascotImage";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const PANEL = "#11171E";
const PANEL_2 = "#0B1117";
const LINE = "#2A3540";
const TEXT = "#F5F7FA";
const MUTED = "#96A2AE";

const modules = [
  {
    module: "Capture Planner",
    title: "Capture Planner",
    description: "Plan coverage, overlap, camera angles, checkpoints and safe capture paths before takeoff.",
    icon: Crosshair,
    badge: "START HERE",
    priority: true,
    visual: "radial-gradient(circle at 50% 50%, rgba(244,90,30,.28), transparent 45%), linear-gradient(135deg,#18212A,#0B1117)",
  },
  {
    module: "Projects",
    title: "Projects & Mapping",
    description: "Upload imagery, process maps and 3D models, measure, analyze and build deliverables.",
    icon: FolderKanban,
    visual: "linear-gradient(145deg,rgba(135,151,165,.19),rgba(19,27,35,.94)), linear-gradient(45deg,#111820,#29323B)",
  },
  {
    module: "DOMINIC HUB",
    title: "DOMINIC HUB",
    description: "Mission planning, fleet management, live operations, sensors, alerts and simulation.",
    icon: Factory,
    badge: "LIVE UI",
    visual: "radial-gradient(circle at 30% 30%, rgba(244,90,30,.25), transparent 40%), linear-gradient(145deg,#101921,#202A33)",
  },
  {
    module: "Live Flight",
    title: "Live Flight",
    description: "Real-time aircraft view, telemetry, camera feed and mission monitoring.",
    icon: Activity,
    badge: "PREVIEW",
    visual: "linear-gradient(135deg,rgba(64,92,112,.55),rgba(12,18,24,.98))",
  },
  {
    module: "AR View",
    title: "AR View",
    description: "Augmented-reality overlays for field context, alignment and on-site validation.",
    icon: Box,
    badge: "PREVIEW",
    visual: "linear-gradient(135deg,rgba(28,92,122,.42),rgba(10,19,28,.98))",
  },
  {
    module: "AI Copilot",
    title: "AI Copilot",
    description: "Mission guidance, checklists, analysis and contextual assistance inside DOMINIC.",
    icon: Sparkles,
    badge: "PREVIEW",
    visual: "linear-gradient(135deg,rgba(72,76,88,.5),rgba(10,15,21,.98))",
  },
];

export default function DominicWelcome({ onOpen }: { onOpen: (module: string) => void }) {
  return (
    <div style={{ minHeight: 720, background: "#0A0F14", overflow: "hidden", borderRadius: 10, border: "1px solid #202A34", boxShadow: "0 26px 90px rgba(0,0,0,.38)" }}>
      <section style={{ position: "relative", minHeight: 420, display: "grid", gridTemplateColumns: "minmax(380px,1.08fr) minmax(420px,.92fr)", overflow: "hidden", background: "#0B1117" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 28% 32%, rgba(244,90,30,.24), transparent 22%), linear-gradient(90deg, rgba(10,15,20,.08) 0%, rgba(10,15,20,.18) 42%, #0B1117 66%, #0B1117 100%)", zIndex: 1, pointerEvents: "none" }} />

        <div style={{ position: "relative", minHeight: 420, overflow: "hidden", background: "linear-gradient(180deg,rgba(13,18,23,.12),rgba(10,15,20,.62)), url('/brand/dom-home-hero-left.webp') center / cover no-repeat" }}>
          <div style={{ position: "absolute", left: "4%", bottom: -22, width: "64%", height: "92%", filter: "drop-shadow(0 28px 42px rgba(0,0,0,.55))", zIndex: 2 }}>
            <DominicMascotImage className="object-contain object-bottom" priority />
          </div>

          <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: 18, width: 210, height: 56, borderRadius: "50%", transform: "translateX(-15%)", border: "4px solid rgba(244,90,30,.75)", boxShadow: "0 0 0 10px rgba(244,90,30,.10), inset 0 0 30px rgba(244,90,30,.16)", opacity: .85, zIndex: 1 }} />

          <div style={{ position: "absolute", left: 22, top: 22, zIndex: 3, border: "1px solid rgba(244,90,30,.35)", background: "rgba(8,13,18,.72)", backdropFilter: "blur(10px)", borderRadius: 999, padding: "8px 11px", color: "#FFC1A8", fontSize: 9, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
            Real operations · smarter capture
          </div>

          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent 0%,transparent 70%,#0B1117 100%),linear-gradient(180deg,transparent 58%,#0B1117 100%)", zIndex: 4, pointerEvents: "none" }} />
        </div>

        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", justifyContent: "center", padding: "44px 44px 46px 30px" }}>
          <div style={{ color: ORANGE, fontSize: 11, fontWeight: 950, letterSpacing: ".22em", textTransform: "uppercase" }}>Welcome to</div>
          <div style={{ marginTop: 12 }}><DominicBrandLockup size="lg" showTagline /></div>
          <p style={{ color: "#C3CCD5", fontSize: 15, lineHeight: 1.7, maxWidth: 560, margin: "24px 0 0" }}>
            Turn images into intelligence. Plan, fly, map, analyze and deliver — all in one workspace.
          </p>
          <div style={{ marginTop: 24, color: "#F5F7FA", fontSize: 18, fontStyle: "italic", letterSpacing: ".02em" }}>
            Same skies. <span style={{ color: ORANGE }}>Smarter missions.</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 24 }}>
            {["PLAN", "FLY", "PROCESS", "DELIVER"].map((step, index) => (
              <span key={step} style={{ border: "1px solid #2B3641", background: "rgba(15,22,29,.72)", borderRadius: 999, padding: "7px 10px", color: index === 0 ? "#FF9D74" : MUTED, fontSize: 9, fontWeight: 900, letterSpacing: ".10em" }}>
                {"0" + (index + 1) + " " + step}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "16px 18px 18px", background: "#0A0F14", borderTop: "1px solid #202A34" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          {modules.map(({ module, title, description, icon: Icon, badge, priority, visual }) => (
            <button key={module} type="button" onClick={() => onOpen(module)} style={{ textAlign: "left", border: priority ? "2px solid " + ORANGE : "1px solid " + LINE, borderRadius: 12, overflow: "hidden", background: PANEL, color: TEXT, cursor: "pointer", minHeight: 278, boxShadow: priority ? "0 14px 32px rgba(244,90,30,.12)" : "none", padding: 0 }}>
              <div style={{ height: 106, background: visual, borderBottom: "1px solid " + LINE, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
                <Icon size={44} strokeWidth={1.35} color={priority ? ORANGE : "#9FB0BE"} />
                <div aria-hidden="true" style={{ position: "absolute", inset: 10, border: "1px solid rgba(255,255,255,.055)", borderRadius: 8 }} />
                {badge ? <span style={{ position: "absolute", left: 10, top: 9, borderRadius: 999, padding: "4px 7px", background: priority ? ORANGE : "rgba(244,90,30,.12)", color: priority ? "#170901" : "#FF9D74", border: priority ? "none" : "1px solid rgba(244,90,30,.34)", fontSize: 7, fontWeight: 950, letterSpacing: ".08em" }}>{badge}</span> : null}
              </div>

              <div style={{ padding: "14px 14px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 27, height: 27, display: "grid", placeItems: "center", borderRadius: 7, background: "rgba(244,90,30,.10)" }}><Icon size={15} color={ORANGE} /></div>
                  <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{title}</strong>
                </div>
                <div style={{ color: "#AAB5BF", fontSize: 10, lineHeight: 1.55, marginTop: 10, minHeight: 62 }}>{description}</div>
                <div style={{ marginTop: 13, border: priority ? "1px solid rgba(244,90,30,.75)" : "1px solid " + LINE, background: priority ? "linear-gradient(90deg," + ORANGE_DARK + "," + ORANGE + ")" : PANEL_2, color: priority ? "#160801" : TEXT, borderRadius: 8, padding: "9px 10px", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {"Open " + title.replace("Projects & Mapping", "Projects")} <ArrowRight size={13} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section style={{ margin: "0 18px 18px", minHeight: 82, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 0, alignItems: "stretch", border: "1px solid " + LINE, borderRadius: 12, background: "#11171E", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, borderRight: "1px solid " + LINE }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", background: "#202831" }}><GraduationCap size={20} color="#D8E0E7" /></div>
          <div><div style={{ fontSize: 11, fontWeight: 900 }}>New to DOMINIC?</div><div style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>Start with Capture Planner and work through the mission lifecycle.</div></div>
          <button onClick={() => onOpen("Capture Planner")} style={{ marginLeft: "auto", border: "1px solid " + ORANGE, background: "transparent", color: "#FF9D74", borderRadius: 8, padding: "9px 12px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>Start Here</button>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, borderRight: "1px solid " + LINE }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", background: "#202831" }}><CircleHelp size={20} color="#D8E0E7" /></div>
          <div><div style={{ fontSize: 11, fontWeight: 900 }}>Need help?</div><div style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>Use the workspace modules in the order that matches your mission.</div></div>
        </div>

        <div style={{ padding: "0 20px", display: "grid", placeItems: "center", color: "#7E8A96", fontSize: 8, fontWeight: 900, letterSpacing: ".22em", whiteSpace: "nowrap" }}>
          MAP · MEASURE · ANALYZE · DELIVER
        </div>
      </section>
    </div>
  );
}
