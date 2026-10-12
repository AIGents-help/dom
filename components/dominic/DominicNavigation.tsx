"use client";

import { Activity, Crosshair, Factory, FolderKanban, Image, Layers3, Map, Radar, ScanSearch, BrainCircuit, type LucideIcon } from "lucide-react";
import styles from "./DominicNavigation.module.css";

type Item = { module: string; label: string; icon: LucideIcon; secondary?: boolean };
const library: Item[] = [
  { module: "Projects", label: "Projects", icon: FolderKanban },
  { module: "Capture Planner", label: "Capture plans", icon: Crosshair },
  { module: "Asset Intelligence", label: "Assets & inspections", icon: Factory },
];
const project: Item[] = [
  { module: "Project Records", label: "Plans & inspections", icon: Crosshair },
  { module: "Intelligent Inspection", label: "Intelligent Inspection", icon: ScanSearch },
  { module: "Data Library", label: "Photos", icon: Image },
  { module: "Deliverables", label: "Reports & exports", icon: Layers3 },
  { module: "Map Viewer", label: "Map & 3D", icon: Map, secondary: true },
  { module: "Processing", label: "Processing", icon: Activity, secondary: true },
];
function NavigationButton({ item, active, collapsed, onOpen }: {
  item: Item; active: boolean; collapsed: boolean; onOpen: (module: string) => void;
}) {
  const Icon = item.icon;
  return <button type="button" aria-label={item.label} aria-current={active ? "page" : undefined}
    title={item.label} onClick={() => onOpen(item.module)} className={styles.button}
    data-collapsed={collapsed} data-secondary={item.secondary || undefined}>
    <Icon size={17} aria-hidden="true" />{!collapsed && <span>{item.label}</span>}
  </button>;
}
export default function DominicNavigation({ activeModule, hasProject, collapsed, onOpen, projectOnly = false, demoMode = false, operationsExpanded = false }: {
  activeModule: string; hasProject: boolean; collapsed: boolean; onOpen: (module: string) => void;
  projectOnly?: boolean; demoMode?: boolean; operationsExpanded?: boolean;
}) {
  const active = (module: string) => module === activeModule || (module === "Map Viewer" && ["3D & Point Cloud", "Measure & Markup", "Analysis"].includes(activeModule));
  const render = (items: Item[]) => items.map((item) => <NavigationButton key={item.module} item={item} active={active(item.module)} collapsed={collapsed} onOpen={onOpen} />);
  return <nav aria-label="DOMINIC navigation" className={styles.navigation} data-compact={projectOnly}>
    {!projectOnly && <section aria-label="Projects library">
      {!collapsed && <p className={styles.label}>Your work</p>}{render(library)}
    </section>}
    {hasProject && <section aria-label="Current project" className={styles.project}>
      {!collapsed && <p className={styles.label}>{projectOnly ? "In this project" : "Selected project"}</p>}
      <div className={projectOnly ? styles.compactGrid : styles.projectButtons}>{render(project)}</div>
    </section>}
    {!projectOnly && <section aria-label="Flight and assist tools">
      {!collapsed && <p className={styles.label}>Field tools</p>}
      {render([
        { module: "Live Flight", label: demoMode ? "Live Flight simulation" : "Live Flight", icon: Radar },
        { module: "AR View", label: demoMode ? "AR View preview" : "AR View", icon: ScanSearch },
        { module: "AI Copilot", label: demoMode ? "AI Copilot preview" : "AI Copilot", icon: BrainCircuit },
      ])}
    </section>}
    {!projectOnly && (operationsExpanded ? <section aria-label="Operations tools">
      <p className={styles.label}>Operations</p><NavigationButton item={{ module: "DOMINIC HUB", label: "DOMINIC HUB", icon: Factory }} active={activeModule === "DOMINIC HUB"} collapsed={false} onOpen={onOpen} />
    </section> : <details className={styles.operations} open={activeModule === "DOMINIC HUB" || undefined}>
      <summary title="Operations">{collapsed ? "..." : "Operations"}</summary>
      <NavigationButton item={{ module: "DOMINIC HUB", label: demoMode ? "Refinery simulator" : "DOMINIC HUB", icon: Factory }} active={activeModule === "DOMINIC HUB"} collapsed={collapsed} onOpen={onOpen} />
    </details>)}
  </nav>;
}
