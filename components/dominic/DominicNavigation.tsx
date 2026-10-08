"use client";

import { Activity, Crosshair, Factory, FolderKanban, Image, Layers3, Map, Radar, ScanSearch, BrainCircuit, type LucideIcon } from "lucide-react";
import { V } from "@/components/mapper/theme";

type Item = { module: string; label: string; icon: LucideIcon };
const library: Item[] = [
  { module: "Capture Planner", label: "Capture plans", icon: Crosshair },
  { module: "Asset Intelligence", label: "Assets & inspections", icon: Factory },
];
const project: Item[] = [
  { module: "Intelligent Inspection", label: "Intelligent Inspection", icon: ScanSearch },
  { module: "Project Records", label: "Plans & inspections", icon: Crosshair },
  { module: "Data Library", label: "Photos", icon: Image },
  { module: "Processing", label: "Processing", icon: Activity },
  { module: "Map Viewer", label: "Map & 3D", icon: Map },
  { module: "Deliverables", label: "Reports & exports", icon: Layers3 },
];

function NavigationButton({ item, active, collapsed, nested, onOpen }: {
  item: Item; active: boolean; collapsed: boolean; nested?: boolean; onOpen: (module: string) => void;
}) {
  const Icon = item.icon;
  return <button type="button" aria-label={item.label} aria-current={active ? "page" : undefined}
    title={item.label} onClick={() => onOpen(item.module)} className="hover:bg-white/5"
    style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 9,
      width: "100%", minHeight: 40, padding: collapsed ? "10px 0" : nested ? "9px 9px 9px 18px" : "9px",
      border: 0, borderRadius: 7, background: active ? "rgba(244,90,30,.14)" : undefined,
      color: active ? V.signal : V.inkDim, fontSize: 12, fontWeight: active ? 700 : 500, textAlign: "left", cursor: "pointer" }}>
    <Icon size={17} style={{ flexShrink: 0 }} />{collapsed ? null : item.label}
  </button>;
}

export default function DominicNavigation({ activeModule, hasProject, collapsed, onOpen, projectOnly = false, demoMode = false }: {
  activeModule: string; hasProject: boolean; collapsed: boolean; onOpen: (module: string) => void; projectOnly?: boolean; demoMode?: boolean;
}) {
  return <nav aria-label="DOMINIC navigation" style={{ display: "grid", gap: 18 }}>
    {projectOnly ? null : <section aria-label="Projects library">
      <NavigationButton item={{ module: "Projects", label: "Projects", icon: FolderKanban }} active={activeModule === "Projects"} collapsed={collapsed} onOpen={onOpen} />
      <div style={{ borderLeft: collapsed ? undefined : `1px solid ${V.line}`, marginLeft: collapsed ? 0 : 17 }}>
        {library.map((item) => <NavigationButton key={item.module} item={item} active={activeModule === item.module} nested collapsed={collapsed} onOpen={onOpen} />)}
      </div>
    </section>}
    {hasProject ? <section aria-label="Current project">
      {!collapsed && !projectOnly ? <div style={{ color: V.inkFaint, fontSize: 10, padding: "0 9px 7px" }}>CURRENT PROJECT</div> : null}
      <div style={projectOnly ? { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))" } : undefined}>
        {project.map((item) => <NavigationButton key={item.module} item={item} active={activeModule === item.module} collapsed={collapsed} onOpen={onOpen} />)}
      </div>
    </section> : null}
    {projectOnly ? null : <section aria-label="Flight and assist tools">
      {!collapsed ? <div style={{ color: V.inkFaint, fontSize: 10, padding: "0 9px 7px" }}>FLIGHT & ASSIST</div> : null}
      {([
        { module: "Live Flight", label: demoMode ? "Live Flight simulation" : "Live Flight", icon: Radar },
        { module: "AR View", label: demoMode ? "AR View preview" : "AR View", icon: ScanSearch },
        { module: "AI Copilot", label: demoMode ? "AI Copilot preview" : "AI Copilot", icon: BrainCircuit },
      ] satisfies Item[]).map((item) => <NavigationButton key={item.module} item={item} active={activeModule === item.module} collapsed={collapsed} onOpen={onOpen} />)}
    </section>}
    {projectOnly ? null : <details>
      <summary title="Operations" style={{ color: V.inkFaint, fontSize: 11, padding: "7px 9px", cursor: "pointer" }}>{collapsed ? "…" : "Operations"}</summary>
      <NavigationButton item={{ module: "DOMINIC HUB", label: "Refinery simulator", icon: Factory }} active={activeModule === "DOMINIC HUB"} collapsed={collapsed} onOpen={onOpen} />
    </details>}
  </nav>;
}
