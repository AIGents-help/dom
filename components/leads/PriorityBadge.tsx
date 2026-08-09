"use client";

import type { LeadScore } from "@/lib/leadsPipeline";

const COLORS: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500 bg-rose-500/10 text-rose-400",
  medium: "border-amber-500 bg-amber-500/10 text-amber-400",
  low: "border-slate-500 bg-slate-500/10 text-muted",
};

const LABELS: Record<"high" | "medium" | "low", string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

// Shows the computed (or manually overridden) priority with a native
// tooltip listing the "why" reasons — deliberately not framed as an AI
// score, just a transparent, hoverable rubric result.
export default function PriorityBadge({ score }: { score: LeadScore }) {
  if (!score.label) return null;
  const title = score.reasons.join(" · ");
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${COLORS[score.label]}`}
    >
      {LABELS[score.label]}
      {score.manual && <span className="text-[10px] opacity-70">(manual)</span>}
    </span>
  );
}
