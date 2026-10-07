"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Crosshair, Factory, KeyRound, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, Wifi, WifiOff } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import MappingTab from "@/components/mapper/MappingTab";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicNavigation from "@/components/dominic/DominicNavigation";
import DominicPreviewEnvironment from "@/components/dominic/DominicPreviewEnvironment";
import DominicHub from "@/components/dominic/DominicHub";
import DominicCapturePlanner from "@/components/dominic/DominicCapturePlanner";
import DominicIntelligentInspection from "@/components/dominic/DominicIntelligentInspection";
import DominicAssetIntelligence from "@/components/dominic/DominicAssetIntelligence";
import { dominicPlanLabel, type DominicAccess } from "@/lib/dominicEntitlements";
import type { DominicInspectionPlanningContext } from "@/lib/dominicInspection";

const ORANGE = "#F45A1E";
const BG = "#0B1015";
const PANEL = "#10161D";
const LINE = "#25303B";
const TEXT = "#F5F7FA";
const MUTED = "#8F9CAA";

const previewModules = new Set(["AR View", "AI Copilot"]);
const mappingModules = new Set([
  "Projects",
  "Project Records",
  "Map Viewer",
  "Processing",
  "Measure & Markup",
  "Analysis",
  "3D & Point Cloud",
  "Deliverables",
  "Data Library",
]);

type DominicFeatureFlags = {
  home: boolean;
  capturePlanner: boolean;
  previews: boolean;
  mapping: boolean;
  hub: boolean;
};


export default function DominicApp() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState("Projects");
  const [openedWorkspaces, setOpenedWorkspaces] = useState<string[]>(["Projects"]);
  const [selectedCapturePlanId, setSelectedCapturePlanId] = useState<string | null>(null);
  const [inspectionSelection, setInspectionSelection] = useState<{ assetId: string; inspectionId: string } | null>(null);
  const [inspectionPlanningContext, setInspectionPlanningContext] = useState<DominicInspectionPlanningContext | null>(null);
  const [showProjectsSignal, setShowProjectsSignal] = useState(0);
  const [newProjectSignal, setNewProjectSignal] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [dominicAccess, setDominicAccess] = useState<DominicAccess | null>(null);
  const [featureAccess, setFeatureAccess] = useState<DominicFeatureFlags | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const openModule = useCallback((module: string) => {
    const workspace = mappingModules.has(module) ? "Projects" : module;
    setOpenedWorkspaces((current) => current.includes(workspace) ? current : [...current, workspace]);
    setActiveModule(module);
  }, []);

  const handleProjectChange = useCallback((projectId: string | null, module = "Map Viewer") => {
    setActiveProjectId(projectId);
    openModule(projectId ? module : "Projects");
  }, [openModule]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      openModule("Projects");
      setNewProjectSignal((value) => value + 1);
      window.history.replaceState({}, "", "/dominic");
    }
  }, [openModule]);

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
    (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace("/dominic/login");
        return;
      }

      try {
        const response = await fetch("/api/dominic/access", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "DOMINIC access could not be loaded.");
        if (!active) return;
        setAccessToken(data.session.access_token);
        setDominicAccess(body.access as DominicAccess);
        setFeatureAccess(body.features as DominicFeatureFlags);
        if (!body.features.mapping) openModule("Capture Planner");
      } catch (error) {
        if (active) setAccessError(error instanceof Error ? error.message : "DOMINIC access could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router, openModule]);

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

  if (accessError) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, border: `1px solid ${LINE}`, borderRadius: 14, background: PANEL, padding: 24, textAlign: "center" }}>
          <DominicBrandLockup size="sm" />
          <h1 style={{ marginTop: 18, fontSize: 20, fontWeight: 900 }}>DOMINIC access could not be verified</h1>
          <p style={{ marginTop: 8, color: MUTED, fontSize: 12, lineHeight: 1.55 }}>{accessError}</p>
          <button onClick={() => router.push("/dominic/licensing")} style={{ marginTop: 16, border: 0, borderRadius: 8, background: ORANGE, color: "#160A02", padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>View Licensing</button>
        </div>
      </div>
    );
  }

  if (!accessToken || !dominicAccess || !featureAccess) return null;

  if (!featureAccess.home) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, border: `1px solid ${LINE}`, borderRadius: 14, background: PANEL, padding: 24, textAlign: "center" }}>
          <DominicBrandLockup size="sm" />
          <h1 style={{ marginTop: 18, fontSize: 20, fontWeight: 900 }}>DOMINIC account inactive</h1>
          <p style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>Contact DOM support to restore software access.</p>
        </div>
      </div>
    );
  }

  const activeMappingModule = mappingModules.has(activeModule);
  const activeLicenseLocked = (activeMappingModule && !featureAccess.mapping) || (activeModule === "DOMINIC HUB" && !featureAccess.hub);

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
          padding: compactViewport ? "10px 12px" : "12px 24px",
          gap: compactViewport ? 10 : 18,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => { openModule("Projects"); setShowProjectsSignal((value) => value + 1); }}
          aria-label="Return to projects"
          title="Projects"
          style={{ minWidth: compactViewport ? 0 : 180, border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
        >
          <DominicBrandLockup size={compactViewport ? "sm" : "md"} showTagline={!compactViewport} compact={compactViewport} />
        </button>


        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right", lineHeight: 1.15, display: compactViewport ? "none" : "block" }}>
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 800 }}>DOMINIC Workspace</div>
            <div style={{ color: dominicAccess.trialActive ? ORANGE : MUTED, fontSize: 9, letterSpacing: ".08em", marginTop: 3, fontWeight: 800 }}>
              {dominicAccess.premiumIncluded ? "PREMIUM INCLUDED · DOM PILOT" : dominicAccess.trialActive ? "OPERATOR TRIAL" : dominicPlanLabel(dominicAccess.plan).toUpperCase()}
            </div>
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
            aria-label="Manage DOMINIC license"
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
            <KeyRound size={15} /> {!compactViewport ? "License" : null}
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: compactViewport ? "minmax(0,1fr)" : sidebarCollapsed ? "68px minmax(0, 1fr)" : "220px minmax(0, 1fr)", minHeight: "calc(100vh - 78px)", transition: "grid-template-columns .18s ease" }}>
        <aside
          style={{
            display: compactViewport ? "none" : "block",
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
                Workspace
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

          <DominicNavigation activeModule={activeModule} hasProject={Boolean(activeProjectId)} collapsed={sidebarCollapsed}
            onOpen={(module) => {
              if ((mappingModules.has(module) && !featureAccess.mapping) || (module === "DOMINIC HUB" && !featureAccess.hub)) {
                router.push("/dominic/licensing");
                return;
              }
              if (module === "Capture Planner") { setSelectedCapturePlanId(null); setInspectionPlanningContext(null); }
              openModule(module);
              if (module === "Projects") setShowProjectsSignal((value) => value + 1);
            }}
          />
        </aside>

        <main style={{ minWidth: 0 }}>
          {compactViewport && activeProjectId ? <div style={{ padding: "8px 14px", borderBottom: `1px solid ${LINE}` }}>
            <DominicNavigation activeModule={activeModule} hasProject collapsed={false} onOpen={openModule} projectOnly />
          </div> : null}
          <section style={{ padding: compactViewport ? "8px 8px 86px" : "16px 20px" }}>
            <div
              style={{
                background: PANEL,
                minHeight: "calc(100vh - 170px)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 14px", color: TEXT, background: "#0B1117", minHeight: 680 }}>
                {activeProjectId && !mappingModules.has(activeModule) ? (
                  <button type="button" onClick={() => openModule("Map Viewer")} style={{ margin: 12, border: `1px solid ${ORANGE}`, background: PANEL, color: TEXT, borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>
                    Return to current project
                  </button>
                ) : null}
                {activeLicenseLocked ? (
                  <div style={{ minHeight: 560, display: "grid", placeItems: "center", padding: 28 }}>
                    <div style={{ maxWidth: 560, textAlign: "center", border: `1px solid ${LINE}`, borderRadius: 14, padding: 26, background: "#10171E" }}>
                      <div style={{ color: ORANGE, fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>
                        {activeModule === "DOMINIC HUB" ? "Organization License" : "Operator License"}
                      </div>
                      <h2 style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>{activeModule} is a licensed DOMINIC module</h2>
                      <p style={{ marginTop: 8, color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
                        DOMINIC Free includes basic capture planning, assets and inspections, and simulations. Premium tools are included at no extra charge with an active DOM Pilot subscription. Standalone software licenses are also available.
                      </p>
                      <button onClick={() => router.push("/dominic/licensing")} style={{ marginTop: 16, border: 0, borderRadius: 8, background: ORANGE, color: "#160A02", padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>View Licensing</button>
                    </div>
                  </div>
                ) : activeModule === "DOMINIC HUB" ? (
                  <DominicHub />
                ) : activeModule === "Capture Planner" ? (
                  <DominicCapturePlanner key={selectedCapturePlanId ?? "new"} inspectionContext={inspectionPlanningContext} projectId={activeProjectId} initialSavedPlanId={selectedCapturePlanId} />
                ) : activeModule === "Live Flight" ? (
                  <DominicCapturePlanner
                    key={selectedCapturePlanId ?? "live"}
                    inspectionContext={inspectionPlanningContext}
                    projectId={activeProjectId}
                    initialSavedPlanId={selectedCapturePlanId}
                    initialPlanningSource="live"
                  />
                ) : activeModule === "Intelligent Inspection" && activeProjectId ? (
                  <DominicIntelligentInspection key={`${activeProjectId}:${inspectionSelection?.inspectionId ?? ""}`} projectId={activeProjectId} accessToken={accessToken} initialInspectionId={inspectionSelection?.inspectionId}
                    onOpenAssets={(assetId, inspectionId) => { setInspectionSelection(assetId && inspectionId ? { assetId, inspectionId } : null); openModule("Asset Intelligence"); }} />
                ) : previewModules.has(activeModule) ? (
                  <DominicPreviewEnvironment module={activeModule as "Live Flight" | "AR View" | "AI Copilot"} onOpen={openModule} />
                ) : null}
                {/* Keep data workspaces mounted so navigation does not discard
                    uploads, the open project, or the selected inspection. */}
                {openedWorkspaces.includes("Asset Intelligence") ? (
                  <div hidden={activeModule !== "Asset Intelligence"}>
                    <DominicAssetIntelligence
                      selection={inspectionSelection}
                      onPlanInspection={(context) => {
                        setSelectedCapturePlanId(null);
                        setInspectionPlanningContext(context);
                        openModule("Capture Planner");
                      }}
                    />
                  </div>
                ) : null}
                {openedWorkspaces.includes("Projects") && featureAccess.mapping ? (
                  <div hidden={!mappingModules.has(activeModule) || activeLicenseLocked}>
                    <MappingTab
                      accessToken={accessToken}
                      focusModule={mappingModules.has(activeModule) ? activeModule : null}
                      showProjectsSignal={showProjectsSignal}
                      newProjectSignal={newProjectSignal}
                      onProjectChange={handleProjectChange}
                      onNavigate={openModule}
                      onOpenCapturePlan={(planId) => {
                        setSelectedCapturePlanId(planId);
                        setInspectionPlanningContext(null);
                        openModule("Capture Planner");
                      }}
                      onOpenInspection={(assetId, inspectionId) => {
                        setInspectionSelection({ assetId, inspectionId });
                        openModule("Intelligent Inspection");
                      }}
                      online={online}
                    />
                  </div>
                ) : null}
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
            { label: "Projects", title: "Projects", icon: FolderKanban },
            { label: "Capture Planner", title: "Capture plans", icon: Crosshair },
            { label: "Asset Intelligence", title: "Assets & inspections", icon: Factory },
            { label: "Live Flight", title: "Simulations", icon: Maximize2 },
          ].map(({ label, title, icon: DockIcon }) => {
            const licenseLocked = mappingModules.has(label) ? !featureAccess.mapping : label === "DOMINIC HUB" ? !featureAccess.hub : false;
            const requiresProject = false;
            const disabled = requiresProject && !activeProjectId;
            const active = activeModule === label || (label === "Live Flight" && previewModules.has(activeModule));
            return (
              <button
                key={label}
                type="button"
                aria-label={title}
                disabled={disabled}
                onClick={() => {
                  if (licenseLocked) {
                    router.push("/dominic/licensing");
                    return;
                  }
                  if (disabled) return;
                  if (label === "Capture Planner") { setSelectedCapturePlanId(null); setInspectionPlanningContext(null); }
                  openModule(label);
                  if (label === "Projects") setShowProjectsSignal((value) => value + 1);
                }}
                style={{
                  minHeight: 48,
                  border: active ? "1px solid rgba(244,90,30,.7)" : "1px solid transparent",
                  borderRadius: 10,
                  background: active ? "rgba(244,90,30,.16)" : "transparent",
                  color: active ? ORANGE : disabled || licenseLocked ? "#7A8792" : TEXT,
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
                <span>{title}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
