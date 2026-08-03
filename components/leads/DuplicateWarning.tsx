"use client";

import type { DuplicateMatch } from "@/lib/leadsPipeline";

// Warns about likely-duplicate leads/clients. Never blocks or auto-merges —
// just surfaces the match so a human can decide.
export default function DuplicateWarning({ matches }: { matches: DuplicateMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
      <p className="mb-1 font-semibold uppercase tracking-wide">Possible duplicate{matches.length > 1 ? "s" : ""}</p>
      <ul className="space-y-1">
        {matches.map((m) => (
          <li key={m.lead.id}>
            {m.lead.company ?? m.lead.name ?? m.lead.id} — {m.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
