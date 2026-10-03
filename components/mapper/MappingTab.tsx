"use client";

import { useEffect, useState } from "react";
import MappingProjectList from "./MappingProjectList";
import MappingProjectCreate from "./MappingProjectCreate";
import MappingProjectWorkspace from "./MappingProjectWorkspace";

type View = { name: "list" } | { name: "create" } | { name: "workspace"; projectId: string };

// Top-level content for the "Mapping" PilotTab. Owns only view-switching
// state — all data loading lives in the child components, same separation
// used by the rest of app/pilot/page.tsx's tabs.
export default function MappingTab({ accessToken, focusModule, onProjectChange, onNavigate, onOpenCapturePlan, onOpenInspection, showProjectsSignal = 0, newProjectSignal = 0, online = true }: { accessToken: string; focusModule?: string | null; onProjectChange?: (projectId: string | null, module?: string) => void; onNavigate?: (module: string) => void; onOpenCapturePlan?: (planId: string | null) => void; onOpenInspection?: (assetId: string, inspectionId: string) => void; showProjectsSignal?: number; newProjectSignal?: number; online?: boolean }) {
  const [view, setView] = useState<View>({ name: "list" });

  useEffect(() => {
    if (showProjectsSignal === 0) return;
    setView({ name: "list" });
    onProjectChange?.(null);
  }, [showProjectsSignal, onProjectChange]);

  useEffect(() => {
    if (newProjectSignal === 0) return;
    setView({ name: "create" });
    onProjectChange?.(null);
  }, [newProjectSignal, onProjectChange]);

  if (view.name === "create") {
    return (
      <MappingProjectCreate
        accessToken={accessToken}
        onCreated={(projectId) => { setView({ name: "workspace", projectId }); onProjectChange?.(projectId, "Data Library"); }}
        onCancel={() => setView({ name: "list" })}
      />
    );
  }

  if (view.name === "workspace") {
    return (
      <MappingProjectWorkspace
        accessToken={accessToken}
        projectId={view.projectId}
        focusModule={focusModule}
        onNavigate={onNavigate}
        onOpenCapturePlan={onOpenCapturePlan}
        onOpenInspection={onOpenInspection}
        online={online}
        onBack={() => { setView({ name: "list" }); onProjectChange?.(null); }}
      />
    );
  }

  return (
    <MappingProjectList
      accessToken={accessToken}
      onOpenProject={(projectId) => { setView({ name: "workspace", projectId }); onProjectChange?.(projectId); }}
      onNewProject={() => setView({ name: "create" })}
    />
  );
}
