"use client";

import { useState } from "react";
import MappingProjectList from "./MappingProjectList";
import MappingProjectCreate from "./MappingProjectCreate";
import MappingProjectWorkspace from "./MappingProjectWorkspace";

type View = { name: "list" } | { name: "create" } | { name: "workspace"; projectId: string };

// Top-level content for the "Mapping" PilotTab. Owns only view-switching
// state — all data loading lives in the child components, same separation
// used by the rest of app/pilot/page.tsx's tabs.
export default function MappingTab({ accessToken }: { accessToken: string }) {
  const [view, setView] = useState<View>({ name: "list" });

  if (view.name === "create") {
    return (
      <MappingProjectCreate
        accessToken={accessToken}
        onCreated={(projectId) => setView({ name: "workspace", projectId })}
        onCancel={() => setView({ name: "list" })}
      />
    );
  }

  if (view.name === "workspace") {
    return (
      <MappingProjectWorkspace
        accessToken={accessToken}
        projectId={view.projectId}
        onBack={() => setView({ name: "list" })}
      />
    );
  }

  return (
    <MappingProjectList
      accessToken={accessToken}
      onOpenProject={(projectId) => setView({ name: "workspace", projectId })}
      onNewProject={() => setView({ name: "create" })}
    />
  );
}
