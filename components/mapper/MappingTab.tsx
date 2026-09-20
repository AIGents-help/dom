"use client";

import { useEffect, useState } from "react";
import MappingProjectList from "./MappingProjectList";
import MappingProjectCreate from "./MappingProjectCreate";
import MappingProjectWorkspace from "./MappingProjectWorkspace";

type View = { name: "list" } | { name: "create" } | { name: "workspace"; projectId: string };

// Top-level content for the "Mapping" PilotTab. Owns only view-switching
// state — all data loading lives in the child components, same separation
// used by the rest of app/pilot/page.tsx's tabs.
export default function MappingTab({ accessToken, focusModule, onProjectChange, showProjectsSignal = 0, online = true }: { accessToken: string; focusModule?: string | null; onProjectChange?: (projectId: string | null) => void; showProjectsSignal?: number; online?: boolean }) {
  const [view, setView] = useState<View>({ name: "list" });

  useEffect(() => {
    if (showProjectsSignal === 0) return;
    setView({ name: "list" });
    onProjectChange?.(null);
  }, [showProjectsSignal, onProjectChange]);

  if (view.name === "create") {
    return (
      <MappingProjectCreate
        accessToken={accessToken}
        onCreated={(projectId) => { setView({ name: "workspace", projectId }); onProjectChange?.(projectId); }}
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
