"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Box,
  Database,
  FolderKanban,
  Layers3,
  Map,
  Ruler,
  Settings,
  Sparkles,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  Factory,
  Crosshair,
  Home,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import MappingTab from "@/components/mapper/MappingTab";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";
import DominicPreviewEnvironment from "@/components/dominic/DominicPreviewEnvironment";
import DominicHub from "@/components/dominic/DominicHub";
import DominicCapturePlanner from "@/components/dominic/DominicCapturePlanner";
import DominicWelcome from "@/components/dominic/DominicWelcome";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const BG = "#0B1015";
const PANEL = "#10161D";
const LINE = "#25303B";
const TEXT = "#F5F7FA";
const MUTED = "#8F9CAA";

const workflow = [
  ["1", "Upload", "Your images"],
  ["2", "Process", "With DOMINIC"],
  ["3", "Review", "2D · 3D · Elevation"],
  ["4", "Measure & Markup", "Notes, dimensions, insights"],
  ["5", "Deliver", "Professional results"],
];

const previewModules = new Set(["Live Flight", "AR View", "AI Copilot"]);
const mappingModules = new Set([
  "Projects",
  "Map Viewer",
  "Processing",
  "Measure & Markup",
  "Analysis",
  "3D & Point Cloud",
  "Deliverables",
  "Data Library",
]);

const nav = [
  { label: "Home", icon: Home, upcoming: false, hub: false },
  { label: "Projects", icon: FolderKanban, upcoming: false, hub: false },
  { label: "Map Viewer", icon: Map, upcoming: false, hub: false },
  { label: "Processing", icon: Activity, upcoming: false, hub: false },
  { label: "Measure & Markup", icon: Ruler, upcoming: false, hub: false },
  { label: "Analysis", icon: Sparkles, upcoming: false, hub: false },
  { label: "3D & Point Cloud", icon: Box, upcoming: false, hub: false },
  { label: "Deliverables", icon: Layers3, upcoming: false, hub: false },
  { label: "Data Library", icon: Database, upcoming: false, hub: false },
  { label: "DOMINIC HUB", icon: Factory, upcoming: false, hub: true },
  { label: "Capture Planner", icon: Crosshair, upcoming: false, hub: false },
  { label: "Live Flight", icon: Activity, upcoming: true, hub: false },
  { label: "AR View", icon: Layers3, upcoming: true, hub: false },
  { label: "AI Copilot", icon: Sparkles, upcoming: true, hub: false },
];

export default function DominicApp() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState("Home");
  const [showProjectsSignal, setShowProjectsSignal] = useState(0);
  const [newProjectSignal, setNewProjectSignal] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectToolsExpanded, setProjectToolsExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);

  const handleProjectChange = useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    setActiveModule(projectId ? "Map Viewer" : "Projects");
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setActiveModule("Projects");
      setNewProjectSignal((value) => value + 1);
      window.history.replaceState({}, "", "/dominic");
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const syncViewport = () => {
      setCompactViewport(media.matches);
      if (media.matches) setSidebarCollapsed(true);
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getSupabaseBrowser().auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace("/dominic/login");
        return;
      }
      setAccessToken(data.session.access_token);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <DominicBrandLockup size="sm" />
          <p style={{ marginTop: 16, color: MUTED, fontFamily: "Inter, sans-serif" }}>Opening DOMINIC…</p>
        </div>
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header
        style={{
          minHeight: 78,
          borderBottom: `1px solid ${LINE}`,
          background: "#171D24",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          gap: 18,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveModule("Home")}
          aria-label="Return to DOMINIC home"
          title="DOMINIC Home"
          style={{ minWidth: 280, border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
        >
          <DominicBrandLockup size="md" />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 22, color: "#E8EDF2", fontSize: 15, whiteSpace: "nowrap" }}>
          <span>Map</span><span>Measure</span><span>Analyze</span><span>Deliver</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right", lineHeight: 1.15, display: compactViewport ? "none" : "block" }}>
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 800 }}>DOM Pilot Workspace</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: ".08em", marginTop: 3 }}>DRONE OPERATION MANAGEMENT</div>
          </div>
          <div
            title={online ? "Network connection available" : "Offline — uploads and cloud processing require connectivity"}
            style={{
              display: compactViewport ? "none" : "inline-flex",
              alignItems: "center",
              gap: 5,
              color: online ? "#70D6A0" : "#FFB86B",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".06em",
              textTransform: "uppercase",
            }}
          >
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? "Online" : "Offline"}
          </div>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }}
            aria-label={fullscreen ? "Exit full screen" : "Open DOMINIC full screen"}
            title={fullscreen ? "Exit full screen" : "Full-screen field mode"}
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL,
              color: TEXT,
              borderRadius: 10,
              width: 40,
              height: 40,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={() => router.push("/dominic/licensing")}
            aria-label="Exit DOMINIC"
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL,
              color: TEXT,
              borderRadius: 10,
              padding: "9px 12px",
              cursor: "pointer",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <LogOut size={15} /> {!compactViewport ? "Exit DOMINIC" : null}
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: sidebarCollapsed ? "68px minmax(0, 1fr)" : "196px minmax(0, 1fr)", minHeight: "calc(100vh - 78px)", transition: "grid-template-columns .18s ease" }}>
        <aside
          style={{
            borderRight: `1px solid ${LINE}`,
            background: "#171D24",
            padding: sidebarCollapsed ? 10 : 12,
            position: "sticky",
            top: 78,
            alignSelf: "start",
            height: "calc(100vh - 78px)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", marginBottom: 12, gap: 8 }}>
            {!sidebarCollapsed ? (
              <div
                style={{
                  padding: "7px 8px",
                  color: ORANGE,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                }}
              >
                Project Workspace
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? "Expand DOMINIC sidebar" : "Collapse DOMINIC sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ border: `1px solid ${LINE}`, background: PANEL, color: MUTED, width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          <nav style={{ display: "grid", gap: 4 }}>
            {nav.map(({ label, icon: Icon, upcoming, hub }) => {
              const projectTool = mappingModules.has(label) && label !== "Projects";
              if (projectTool && (!activeProjectId || !projectToolsExpanded)) return null;
              const preview = Boolean(upcoming);
              const projectRequired = label !== "Home" && label !== "Projects" && label !== "Capture Planner" && !preview && !hub;
              const disabled = projectRequired && !activeProjectId;
              const active = activeModule === label;
              const title = hub ? "Open the DOMINIC HUB refinery operations simulator" : preview ? `${label} — Preview environment` : disabled ? "Open a DOMINIC project first" : label;
              return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                title={title}
                aria-label={preview ? `${label}, preview environment` : label}
                onClick={() => {
                  if (disabled) return;
                  setActiveModule(label);
                  if (label === "Projects") setShowProjectsSignal((value) => value + 1);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  borderRadius: 9,
                  padding: sidebarCollapsed ? "10px 0" : "9px 9px",
                  color: active ? "#160A02" : hub ? "#F2F5F8" : preview ? "#C9D1D9" : disabled ? "#B5BEC7" : "#D1D7DD",
                  background: active
                    ? `linear-gradient(90deg, ${ORANGE_DARK}, ${ORANGE})`
                    : hub
                      ? "rgba(244,90,30,.10)"
                      : preview
                        ? "rgba(244,90,30,.055)"
                        : "transparent",
                  border: active
                    ? "1px solid rgba(244,90,30,.7)"
                    : hub
                      ? "1px solid rgba(244,90,30,.36)"
                      : preview
                        ? "1px solid rgba(244,90,30,.18)"
                        : "1px solid transparent",
                  fontWeight: active ? 900 : 500,
                  width: "100%",
                  justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: 1,
                  fontSize: 12,
                  position: "relative",
                }}
              >
                <Icon size={17} color={active ? "#160A02" : hub ? ORANGE : preview ? ORANGE : disabled ? "#98A5B1" : "#AEB8C2"} />
                {!sidebarCollapsed ? (
                  <>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", lineHeight: 1.2 }}>{label}</span>
                    {hub ? (
                      <span style={{ border: "1px solid rgba(100,214,154,.38)", background: "rgba(100,214,154,.10)", color: "#8FE2B2", borderRadius: 999, padding: "2px 6px", fontSize: 8, lineHeight: 1.2, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>LIVE UI</span>
                    ) : preview ? (
                      <span
                        style={{
                          border: "1px solid rgba(244,90,30,.38)",
                          background: "rgba(244,90,30,.11)",
                          color: "#FF9A70",
                          borderRadius: 999,
                          padding: "2px 6px",
                          fontSize: 8,
                          lineHeight: 1.2,
                          fontWeight: 900,
                          letterSpacing: ".08em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Soon
                      </span>
                    ) : null}
                  </>
                ) : preview ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 5,
                      right: 6,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: ORANGE,
                      boxShadow: "0 0 0 2px rgba(244,90,30,.16)",
                    }}
                  />
                ) : null}
              </button>
              );
            })}

            {!sidebarCollapsed && activeProjectId ? (
              <button
                type="button"
                onClick={() => setProjectToolsExpanded((value) => !value)}
                aria-expanded={projectToolsExpanded}
                title={projectToolsExpanded ? "Hide project tools" : "Show project tools"}
                style={{
                  order: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  border: "1px solid " + LINE,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.025)",
                  color: MUTED,
                  padding: "8px 9px",
                  cursor: "pointer",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".04em",
                }}
              >
                {projectToolsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {projectToolsExpanded ? "Hide Project Tools" : "Show Project Tools"}
              </button>
            ) : null}
          </nav>

          {!sidebarCollapsed ? (
            <div
              style={{
                marginTop: 12,
                padding: "10px 11px",
                border: "1px solid rgba(244,90,30,.14)",
                borderRadius: 10,
                background: "rgba(10,14,18,.28)",
                color: MUTED,
                fontSize: 10,
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: ORANGE, fontWeight: 900, letterSpacing: ".07em", textTransform: "uppercase" }}>
                DOMINIC Live
              </span>
              <div style={{ marginTop: 4 }}>
                Live telemetry, augmented-reality overlays and AI flight assistance are being built into this workspace.
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
            <div title="Settings" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", padding: sidebarCollapsed ? "10px 0" : "8px 10px", color: MUTED, fontSize: 13 }}>
              <Settings size={17} />
              {!sidebarCollapsed ? "Settings" : null}
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
              border: `1px solid ${LINE}`,
              borderRadius: 14,
              overflow: "hidden",
              background: "radial-gradient(circle at 50% 0%, rgba(244,90,30,.14), transparent 62%), #171D24",
              textAlign: "center",
              display: sidebarCollapsed ? "none" : "block",
            }}
          >
            <div style={{ position: "relative", aspectRatio: "4 / 5", width: "100%", overflow: "hidden" }}>
              <DominicMascotImage className="object-contain object-bottom p-2" />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(9,13,17,.92) 100%)" }} />
            </div>
            <div style={{ padding: "0 12px 14px", marginTop: -16, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <DominicBrandLockup size="sm" showTagline={false} compact />
              </div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>Same Perspective. Higher Purpose.</div>
            </div>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          <section
            style={{
              borderBottom: `1px solid ${LINE}`,
              background: "#0E141A",
              padding: sidebarCollapsed ? "10px 12px" : "12px 18px",
              display: mappingModules.has(activeModule) ? "grid" : "none",
              gridTemplateColumns: compactViewport ? "repeat(5, minmax(112px, 1fr))" : "repeat(5, minmax(130px, 1fr))",
              gap: 8,
              overflowX: "auto",
            }}
          >
            {workflow.map(([n, title, sub], index) => (
              <div
                key={title}
                style={{
                  minWidth: 140,
                  display: "grid",
                  gridTemplateColumns: "34px 1fr",
                  gap: 9,
                  alignItems: "center",
                  padding: "7px 10px",
                  borderRight: index < workflow.length - 1 ? `1px solid ${LINE}` : "none",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: index === 1 ? ORANGE : "#F1F4F7",
                    color: index === 1 ? "#180A02" : "#111820",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  {n}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>
                </div>
              </div>
            ))}
          </section>

          <section style={{ padding: activeModule === "Home" ? (compactViewport ? "6px 6px 86px" : "0 0 18px") : (compactViewport ? "8px 8px 86px" : "12px 14px 18px") }}>
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: activeModule === "Home" ? 0 : 12,
                background: PANEL,
                minHeight: "calc(100vh - 170px)",
                boxShadow: "0 24px 80px rgba(0,0,0,.24)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: activeModule === "Home" ? 0 : "12px 14px", color: TEXT, background: "#0B1117", minHeight: 680 }}>
                {activeModule === "Home" ? (
                  <DominicWelcome
                    onOpen={(module) => {
                      setActiveModule(module);
                      if (module === "Projects") setShowProjectsSignal((value) => value + 1);
                    }}
                  />
                ) : activeModule === "DOMINIC HUB" ? (
                  <DominicHub />
                ) : activeModule === "Capture Planner" ? (
                  <DominicCapturePlanner />
                ) : previewModules.has(activeModule) ? (
                  <DominicPreviewEnvironment module={activeModule as "Live Flight" | "AR View" | "AI Copilot"} />
                ) : (
                  <MappingTab
                    accessToken={accessToken}
                    focusModule={activeModule}
                    showProjectsSignal={showProjectsSignal}
                    newProjectSignal={newProjectSignal}
                    onProjectChange={handleProjectChange}
                    online={online}
                  />
                )}
              </div>
            </div>
          </section>
        </main>
      </div>

      {compactViewport ? (
        <nav
          aria-label="DOMINIC field navigation"
          style={{
            position: "fixed",
            left: 8,
            right: 8,
            bottom: "max(8px, env(safe-area-inset-bottom))",
            zIndex: 60,
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 6,
            padding: 6,
            border: `1px solid ${LINE}`,
            borderRadius: 14,
            background: "rgba(9,13,17,.94)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 14px 36px rgba(0,0,0,.45)",
          }}
        >
          {[
            { label: "Home", icon: Home },
            { label: "Capture Planner", icon: Crosshair },
            { label: "Projects", icon: FolderKanban },
            { label: "DOMINIC HUB", icon: Factory },
          ].map(({ label, icon: DockIcon }) => {
            const requiresProject = false;
            const disabled = requiresProject && !activeProjectId;
            const active = activeModule === label;
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setActiveModule(label);
                  if (label === "Projects") setShowProjectsSignal((value) => value + 1);
                }}
                style={{
                  minHeight: 48,
                  border: active ? "1px solid rgba(244,90,30,.7)" : "1px solid transparent",
                  borderRadius: 10,
                  background: active ? "rgba(244,90,30,.16)" : "transparent",
                  color: active ? ORANGE : disabled ? "#58626D" : TEXT,
                  display: "grid",
                  justifyItems: "center",
                  alignContent: "center",
                  gap: 3,
                  fontSize: 8,
                  fontWeight: 800,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <DockIcon size={17} />
                <span>{label === "Capture Planner" ? "Capture" : label === "DOMINIC HUB" ? "HUB" : label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
