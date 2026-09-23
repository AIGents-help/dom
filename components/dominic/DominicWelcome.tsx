"use client";

import Image from "next/image";
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

const modules = [
  {
    module: "Capture Planner",
    title: "Capture Planner",
    description: "Plan coverage, overlap, camera angles, checkpoints and safe capture paths before takeoff.",
    icon: Crosshair,
    badge: "START HERE",
    priority: true,
    image: "/images/construction-aerial.jpg",
    kind: "capture",
  },
  {
    module: "Projects",
    title: "Projects & Mapping",
    description: "Upload imagery, process maps and 3D models, measure, analyze and build deliverables.",
    icon: FolderKanban,
    image: "/images/construction-aerial.jpg",
    kind: "mapping",
  },
  {
    module: "DOMINIC HUB",
    title: "DOMINIC HUB",
    description: "Mission planning, fleet management, live operations, sensors, alerts and simulation.",
    icon: Factory,
    badge: "LIVE UI",
    image: "/images/city-night-aerial.jpg",
    kind: "hub",
  },
  {
    module: "Live Flight",
    title: "Live Flight",
    description: "Real-time aircraft view, telemetry, camera feed and mission monitoring.",
    icon: Activity,
    badge: "PREVIEW",
    image: "/images/drone-operation-safety.png",
    kind: "live",
  },
  {
    module: "AR View",
    title: "AR View",
    description: "Augmented-reality overlays for field context, alignment and on-site validation.",
    icon: Box,
    badge: "PREVIEW",
    image: "/images/solar-aerial.jpg",
    kind: "ar",
  },
  {
    module: "AI Copilot",
    title: "AI Copilot",
    description: "Mission guidance, checklists, analysis and contextual assistance inside DOMINIC.",
    icon: Sparkles,
    badge: "PREVIEW",
    image: "/brand/dominic-home-kneeling.webp",
    kind: "ai",
  },
] as const;

function CardVisual({ item }: { item: (typeof modules)[number] }) {
  return (
    <div style={{ position: "relative", height: 122, overflow: "hidden", borderBottom: "1px solid " + LINE, background: "#0B1117" }}>
      <Image
        src={item.image}
        alt=""
        fill
        sizes="(max-width: 900px) 50vw, 220px"
        style={{ objectFit: "cover", objectPosition: item.kind === "ai" ? "center 35%" : "center" }}
      />
      <div style={{ position: "absolute", inset: 0, background: item.kind === "ai" ? "linear-gradient(90deg,rgba(8,13,18,.08),rgba(8,13,18,.76))" : "linear-gradient(180deg,rgba(8,13,18,.05),rgba(8,13,18,.42))" }} />

      {item.kind === "capture" ? (
        <>
          <div style={{ position: "absolute", left: "12%", right: "12%", top: "20%", bottom: "17%", border: "3px solid " + ORANGE, borderRadius: "50%", transform: "rotate(-7deg)", boxShadow: "0 0 18px rgba(244,90,30,.5)" }} />
          <div style={{ position: "absolute", left: "21%", right: "21%", top: "31%", bottom: "27%", border: "2px solid rgba(244,90,30,.85)", borderRadius: "50%", transform: "rotate(-7deg)" }} />
          {[20,34,49,65,80].map((left) => <span key={left} style={{ position: "absolute", left: left + "%", top: left % 2 ? "24%" : "67%", width: 7, height: 7, marginLeft: -3, borderRadius: "50%", background: ORANGE, boxShadow: "0 0 0 3px rgba(244,90,30,.2)" }} />)}
        </>
      ) : null}

      {item.kind === "hub" ? (
        <>
          {[["22%","31%"],["45%","48%"],["68%","27%"],["79%","61%"]].map(([l,t]) => <span key={l+t} style={{ position: "absolute", left: l, top: t, width: 8, height: 8, borderRadius: "50%", background: ORANGE, boxShadow: "0 0 0 4px rgba(244,90,30,.18),0 0 12px rgba(244,90,30,.65)" }} />)}
        </>
      ) : null}

      {item.kind === "live" ? (
        <div style={{ position: "absolute", right: 9, bottom: 9, border: "1px solid rgba(244,90,30,.55)", background: "rgba(6,11,16,.8)", borderRadius: 7, padding: "5px 7px", color: "#D6DEE6", fontSize: 7, lineHeight: 1.45 }}>
          ALT 118 ft<br />SAT 21 · LINK 98%
        </div>
      ) : null}

      {item.kind === "ar" ? (
        <>
          <div style={{ position: "absolute", left: "16%", top: "19%", width: "62%", height: "55%", border: "2px solid #38CFFF", boxShadow: "0 0 16px rgba(56,207,255,.4)" }} />
          <div style={{ position: "absolute", left: "22%", top: "35%", color: "#78E7FF", fontSize: 8, fontWeight: 900, background: "rgba(4,20,28,.75)", padding: "3px 5px", borderRadius: 4 }}>35.2 ft</div>
          <div style={{ position: "absolute", right: "15%", bottom: "24%", color: "#78E7FF", fontSize: 8, fontWeight: 900, background: "rgba(4,20,28,.75)", padding: "3px 5px", borderRadius: 4 }}>72.4 ft</div>
        </>
      ) : null}

      {item.kind === "ai" ? (
        <div style={{ position: "absolute", right: 8, top: 10, width: "48%", border: "1px solid rgba(103,216,255,.4)", borderRadius: 8, padding: "7px 8px", background: "rgba(8,16,22,.82)", color: "#D8F5FF", fontSize: 7, lineHeight: 1.6 }}>
          ✓ Analyze<br />✓ Find anomalies<br />✓ Generate report<br />✓ Suggest next flight
        </div>
      ) : null}

      {item.badge ? (
        <span style={{ position: "absolute", left: 9, top: 8, borderRadius: 999, padding: "4px 7px", background: item.priority ? ORANGE : "rgba(244,90,30,.16)", color: item.priority ? "#170901" : "#FF9D74", border: item.priority ? "none" : "1px solid rgba(244,90,30,.42)", fontSize: 7, fontWeight: 950, letterSpacing: ".08em" }}>
          {item.badge}
        </span>
      ) : null}
    </div>
  );
}

export default function DominicWelcome({ onOpen }: { onOpen: (module: string) => void }) {
  return (
    <div style={{ minHeight: 720, background: "#090E13", overflow: "hidden", border: "1px solid #202A34", boxShadow: "0 26px 90px rgba(0,0,0,.38)" }}>
      <section style={{ position: "relative", minHeight: 392, overflow: "hidden", background: "#0A0F14" }}>
        <Image
          src="/images/city-night-aerial.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center 55%", filter: "saturate(.78) brightness(.66)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,#090E13 0%,rgba(9,14,19,.97) 18%,rgba(9,14,19,.35) 45%,rgba(9,14,19,.16) 67%,#090E13 100%),linear-gradient(180deg,rgba(9,14,19,.08) 45%,#090E13 100%)" }} />

        <div aria-hidden="true" style={{ position: "absolute", left: "30%", right: "20%", bottom: 60, height: 7, borderRadius: 4, background: ORANGE, boxShadow: "0 0 15px rgba(244,90,30,.35)" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: "29.5%", bottom: 24, width: 14, height: 108, borderRadius: 4, background: "repeating-linear-gradient(180deg,#F45A1E 0 20px,#111820 20px 37px)" }} />
        <div aria-hidden="true" style={{ position: "absolute", right: "19.5%", bottom: 24, width: 14, height: 108, borderRadius: 4, background: "repeating-linear-gradient(180deg,#F45A1E 0 20px,#111820 20px 37px)" }} />

        <div style={{ position: "absolute", left: "34%", bottom: -8, width: "33%", height: "106%", filter: "drop-shadow(0 30px 44px rgba(0,0,0,.68))" }}>
          <Image src="/brand/dominic-home-kneeling.webp" alt="DOMINIC preparing a drone mission" fill priority sizes="38vw" style={{ objectFit: "contain", objectPosition: "center bottom" }} />
        </div>

        <div style={{ position: "absolute", left: "7%", top: 42, zIndex: 3, width: "27%", minWidth: 290 }}>
          <div style={{ color: ORANGE, fontSize: 11, fontWeight: 950, letterSpacing: ".19em", textTransform: "uppercase" }}>Welcome to</div>
          <div style={{ marginTop: 12 }}><DominicBrandLockup size="lg" showTagline /></div>
          <p style={{ color: "#D0D7DE", fontSize: 15, lineHeight: 1.55, margin: "24px 0 0", maxWidth: 370 }}>
            Turn images into intelligence.<br />Plan, fly, map, analyze and deliver —<br />all in one workspace.
          </p>
          <div style={{ marginTop: 22, color: "#F5F7FA", fontSize: 19, fontStyle: "italic", letterSpacing: ".02em" }}>
            Same skies. <span style={{ color: ORANGE }}>Smarter missions.</span>
          </div>
        </div>

        <div style={{ position: "absolute", right: "5%", top: 48, width: 205, display: "grid", gap: 10, color: "#D9E0E7", fontSize: 9, fontWeight: 850, letterSpacing: ".12em", textTransform: "uppercase" }}>
          {["Safer operations","Higher accuracy","Real insights","Greater efficiency"].map((label) => (
            <div key={label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 22, height: 22, border: "1px solid rgba(255,255,255,.3)", borderRadius: "50%", display: "grid", placeItems: "center", color: ORANGE }}>•</span>
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
              <button key={item.module} type="button" onClick={() => onOpen(item.module)} style={{ textAlign: "left", border: item.priority ? "2px solid " + ORANGE : "1px solid " + LINE, borderRadius: 11, overflow: "hidden", background: PANEL, color: TEXT, cursor: "pointer", padding: 0, minWidth: 0, boxShadow: item.priority ? "0 0 0 1px rgba(244,90,30,.18),0 12px 28px rgba(244,90,30,.12)" : "none" }}>
                <CardVisual item={item} />
                <div style={{ padding: "12px 12px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: "50%", background: "rgba(244,90,30,.10)", border: "1px solid rgba(244,90,30,.25)" }}><Icon size={14} color={ORANGE} /></div>
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
