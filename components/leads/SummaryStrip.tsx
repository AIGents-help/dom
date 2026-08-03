"use client";

import { matchesSavedView, type LeadContext, type SavedViewKey } from "@/lib/leadsPipeline";

// Six clickable KPI tiles — shortcuts into a SUBSET of the 13 saved views
// below (not a separate filtering system). No decorative charts, just counts.
const TILES: { key: SavedViewKey; label: string; urgent?: boolean }[] = [
  { key: "needs_response", label: "Needs Response", urgent: true },
  { key: "contact_today", label: "Due Today" },
  { key: "overdue", label: "Overdue", urgent: true },
  { key: "high_priority", label: "High Priority" },
  { key: "campaign_active", label: "Active Outreach" },
  { key: "proposals", label: "Proposals Open" },
];

export default function SummaryStrip({
  contexts,
  today,
  activeView,
  onSelectView,
}: {
  contexts: LeadContext[];
  today: string;
  activeView: SavedViewKey;
  onSelectView: (view: SavedViewKey) => void;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {TILES.map((tile) => {
        const count = contexts.filter((ctx) => matchesSavedView(ctx, tile.key, today)).length;
        const active = activeView === tile.key;
        const highlight = tile.urgent && count > 0;
        return (
          <button
            key={tile.key}
            onClick={() => onSelectView(tile.key)}
            className={`rounded-lg border p-3 text-left transition ${
              active
                ? "border-accent bg-accent/10"
                : highlight
                  ? "border-rose-500/50 bg-rose-500/5 hover:border-rose-500"
                  : "border-border bg-surface2 hover:border-accent/40"
            }`}
          >
            <div className={`text-xl font-semibold ${highlight ? "text-rose-400" : "text-white"}`}>{count}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{tile.label}</div>
          </button>
        );
      })}
    </div>
  );
}
