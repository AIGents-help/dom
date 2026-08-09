"use client";

import {
  type LeadContext, type StatusValue, STATUS_OPTIONS, TERMINAL_STATUSES,
  INDUSTRY_LABELS, isDjiRestricted, isDueToday, isOverdue, normalizeStatus, scoreLead,
  canEnrollInOutreach,
} from "@/lib/leadsPipeline";
import PriorityBadge from "./PriorityBadge";
import type { DrawerTab } from "./LeadDetailDrawer";

function smartleadSummary(ctx: LeadContext): string | null {
  const s = ctx.smartlead;
  if (!s) return null;
  const parts: string[] = [];
  if (s.campaign_name) parts.push(s.campaign_name);
  if (s.sequence_step) parts.push(`Step ${s.sequence_step}`);
  if (s.open_count > 0) parts.push(`Opened ${s.open_count}x`);
  if (s.last_replied_at) parts.push("Replied");
  else if (s.last_sent_at) parts.push("No reply");
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export default function LeadCard({
  ctx,
  today,
  busy,
  smartleadConfigured,
  lastActivitySummary,
  location,
  onOpen,
  onLogContactNow,
  onStatusChange,
  onAddToSmartlead,
  onConvert,
  onDoNotContact,
  onApproveForOutreach,
}: {
  ctx: LeadContext;
  today: string;
  busy: boolean;
  smartleadConfigured: boolean;
  lastActivitySummary: string | null;
  location: string | null;
  onOpen: (tab?: DrawerTab) => void;
  onLogContactNow: () => void;
  onStatusChange: (status: StatusValue) => void;
  onAddToSmartlead: () => void;
  onConvert: () => void;
  onDoNotContact: () => void;
  onApproveForOutreach: () => void;
}) {
  const { lead, openNextAction } = ctx;
  const status = normalizeStatus(lead.status);
  // Companies that already provide drone/UAS services are flagged in Supabase
  // with relationship_type = 'drone_provider' and get a pale yellow card.
  const isDroneProvider = lead.relationship_type === "drone_provider";
  const restricted = isDjiRestricted(lead);
  const score = scoreLead(ctx);
  const outreachSummary = smartleadSummary(ctx);
  const dueOverdue = openNextAction && isOverdue(openNextAction.due_at, today) && !TERMINAL_STATUSES.includes(status);
  const dueToday = openNextAction && isDueToday(openNextAction.due_at, today) && !TERMINAL_STATUSES.includes(status);
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const enrollGuard = canEnrollInOutreach(lead, ctx.smartlead);

  return (
    <div className={`rounded-lg border border-border p-4 ${isDroneProvider ? "bg-[#FFF4C2]" : "bg-surface"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <button onClick={() => onOpen()} className="min-w-[180px] flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{lead.company ?? lead.name ?? "Unnamed"}</span>
            {restricted && (
              <span className="inline-flex items-center rounded-full border border-rose-500 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                DJI Restricted
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">{lead.name ?? "No contact name"} · {lead.email ?? "—"}</div>
        </button>

        <div className="grid flex-[2] grid-cols-2 gap-2 text-xs sm:grid-cols-4 min-w-[260px]">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Industry</div>
            <div className="text-ink">{lead.industry ? INDUSTRY_LABELS[lead.industry] ?? lead.industry : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Service opportunity</div>
            <div className="truncate text-ink" title={lead.service_opportunity ?? ""}>{lead.service_opportunity || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Location</div>
            <div className="truncate text-ink" title={location ?? ""}>{location || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Est. value</div>
            <div className="text-ink">
              {lead.total_project_value ? `$${lead.total_project_value.toLocaleString()}` : lead.expected_dom_revenue ? `$${lead.expected_dom_revenue.toLocaleString()}` : "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <PriorityBadge score={score} />
            <select
              value={status}
              disabled={busy}
              onChange={(e) => onStatusChange(e.target.value as StatusValue)}
              className={`rounded-full border bg-surface px-2 py-1 text-xs font-medium disabled:opacity-50 ${STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "border-border text-ink"}`}
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {openNextAction ? (
            <span className={`text-xs ${dueOverdue ? "text-rose-400" : dueToday ? "text-amber-400" : "text-slate-500"}`}>
              {dueOverdue ? "Overdue: " : dueToday ? "Due today: " : "Next: "}
              {openNextAction.action_type}
              {openNextAction.due_at && ` (${new Date(openNextAction.due_at).toLocaleDateString()})`}
            </span>
          ) : lead.next_action ? (
            <span className="text-xs text-slate-500">Next: {lead.next_action} <span className="text-slate-600">(legacy)</span></span>
          ) : (
            <span className="text-xs text-slate-600">No next action set</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>{lastActivitySummary ?? "No activity logged yet"}</span>
          {outreachSummary && <span className="text-slate-400">{outreachSummary}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={lead.email ? `mailto:${lead.email}` : undefined}
            aria-disabled={!lead.email}
            className={`rounded border border-border px-2 py-1 ${lead.email ? "text-ink hover:text-ink hover:border-accent/60" : "cursor-not-allowed text-slate-400"}`}
            onClick={(e) => { if (!lead.email) e.preventDefault(); }}
          >
            Email
          </a>
          <a
            href={lead.phone ? `tel:${lead.phone}` : undefined}
            aria-disabled={!lead.phone}
            className={`rounded border border-border px-2 py-1 ${lead.phone ? "text-ink hover:text-ink hover:border-accent/60" : "cursor-not-allowed text-slate-400"}`}
            onClick={(e) => { if (!lead.phone) e.preventDefault(); }}
          >
            Call
          </a>
          <button disabled={busy} className="rounded border border-border px-2 py-1 text-ink hover:text-ink hover:border-accent/60 disabled:opacity-50" onClick={() => onOpen("activity")}>
            Log
          </button>
          <button disabled={busy} className="rounded border border-border px-2 py-1 text-ink hover:text-ink hover:border-accent/60 disabled:opacity-50" onClick={() => onOpen("next_action")}>
            Schedule
          </button>
          <button disabled={busy} className="rounded border border-border px-2 py-1 text-ink hover:text-ink hover:border-accent/60 disabled:opacity-50" onClick={onLogContactNow}>
            Log contact
          </button>
          {!isTerminal && (
            <button disabled={busy} className="rounded border border-border px-2 py-1 text-ink hover:text-ink hover:border-accent/60 disabled:opacity-50" onClick={onApproveForOutreach}>
              Approve outreach
            </button>
          )}
          {smartleadConfigured && (
            <button
              disabled={busy || !enrollGuard.ok}
              title={enrollGuard.ok ? "Add to a Smartlead campaign" : enrollGuard.reason}
              className="rounded border border-border px-2 py-1 text-ink hover:text-ink hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onAddToSmartlead}
            >
              Add to Smartlead
            </button>
          )}
          {!isTerminal && (
            <button disabled={busy} className="rounded border border-border px-2 py-1 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/60 disabled:opacity-50" onClick={onConvert}>
              Convert
            </button>
          )}
          {status !== "do_not_contact" && (
            <button disabled={busy} className="rounded border border-border px-2 py-1 text-rose-400 hover:text-rose-300 hover:border-rose-500/60 disabled:opacity-50" onClick={onDoNotContact}>
              Do Not Contact
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
