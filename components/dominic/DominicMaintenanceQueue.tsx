"use client";

import { useMemo, useState } from "react";
import { issueLifecycleLabel } from "@/lib/dominicIssueLifecycle";
import {
  filterMaintenanceQueue,
  type MaintenanceQueueEntry,
  type MaintenanceQueueStage,
} from "@/lib/dominicMaintenanceQueue";
import { maintenanceReviewPriorityLabel } from "@/lib/dominicMaintenanceReview";

const TEXT = "#F4F7FA";
const MUTED = "#A7B4C0";
const LINE = "#26323D";
const PANEL = "#10171E";
const ORANGE = "#F45A1E";
const controls = { background: "#151E27", color: TEXT, border: `1px solid ${LINE}`, borderRadius: 7, padding: "8px 10px", fontSize: 12 };
const PAGE_SIZE = 10;
const stages: Array<{ value: MaintenanceQueueStage | "all"; label: string }> = [
  { value: "all", label: "All active work" },
  { value: "review", label: "Needs review" },
  { value: "maintenance", label: "Maintenance in progress" },
  { value: "verification", label: "Awaiting verification" },
];

export default function DominicMaintenanceQueue({ entries, loading, error, selectedIssueId, onSelectIssue }: {
  entries: MaintenanceQueueEntry[];
  loading: boolean;
  error?: string | null;
  selectedIssueId: string | null;
  onSelectIssue: (issueId: string, assetId: string) => void;
}) {
  const [stage, setStage] = useState<MaintenanceQueueStage | "all">("all");
  const [priority, setPriority] = useState<"all" | "escalated">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterMaintenanceQueue(entries, { stage, priority, search }), [entries, stage, priority, search]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <section aria-label="Maintenance work queue" aria-busy={loading} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: `1px solid ${LINE}` }}>
        <h2 style={{ margin: 0, fontSize: 15, color: TEXT }}>Maintenance work queue</h2>
        <p style={{ color: MUTED, fontSize: 12, margin: "5px 0 12px" }}>Confirmed issues across your assets, ranked for operator maintenance review.</p>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {stages.map(({ value, label }) => {
            const count = value === "all" ? entries.length : entries.filter((entry) => entry.stage === value).length;
            return <button key={value} type="button" aria-pressed={stage === value} onClick={() => { setStage(value); setPage(0); }} disabled={loading || Boolean(error)} style={{ ...controls, borderColor: stage === value ? ORANGE : LINE, cursor: "pointer" }}>
              {label}{loading || error ? "" : ` (${count})`}
            </button>;
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <input aria-label="Search maintenance work" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search issue, asset, location or work order" style={{ ...controls, flex: "1 1 260px", minWidth: 0 }} />
          <select aria-label="Maintenance priority filter" value={priority} onChange={(event) => { setPriority(event.target.value as "all" | "escalated"); setPage(0); }} style={controls}>
            <option value="all">All priorities</option>
            <option value="escalated">Attention now + elevated</option>
          </select>
        </div>
      </div>
      {loading ? <p role="status" style={{ padding: 14, color: MUTED }}>Loading maintenance work…</p>
        : error ? <p role="alert" style={{ padding: 14, color: "#FF7474" }}>Maintenance queue could not be loaded completely. Use Refresh to retry. {error}</p>
          : filtered.length === 0 ? <p style={{ padding: 14, color: MUTED }}>{entries.length === 0 ? "No unresolved maintenance or verification work is recorded." : "No work matches these filters."}</p>
            : <>
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {visible.map(({ issue, asset, assessment, workOrder }) => {
                  const color = assessment.priority === "attention_now" ? "#FF7474" : assessment.priority === "elevated" ? "#FFB565" : MUTED;
                  return <article key={issue.id} style={{ padding: "12px 14px", borderBottom: `1px solid ${LINE}`, background: selectedIssueId === issue.id ? "rgba(244,90,30,.08)" : undefined }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
                      <div style={{ flex: "1 1 260px" }}>
                        <div style={{ fontSize: 11, color, fontWeight: 800 }}>{maintenanceReviewPriorityLabel(assessment.priority)} · {issue.severity.toUpperCase()}</div>
                        <h3 style={{ margin: "5px 0", color: TEXT, fontSize: 14 }}>{issue.title}</h3>
                        <div style={{ color: TEXT, fontSize: 12 }}>{asset?.name ?? "Asset unavailable"}{asset?.external_ref ? ` · ${asset.external_ref}` : ""}{asset?.location_label ? ` · ${asset.location_label}` : ""}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>{issueLifecycleLabel(issue)}{workOrder ? ` · Work order ${workOrder}` : ""}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>{assessment.reasons.join(" ") || "Recorded issue requires operator follow-up."}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={!asset} onClick={() => onSelectIssue(issue.id, issue.asset_id)} style={{ ...controls, cursor: asset ? "pointer" : "not-allowed" }}>Open issue</button>
                        <a href={`/dominic/issues/${issue.id}/maintenance-package`} target="_blank" rel="noopener noreferrer" style={{ ...controls, textDecoration: "none" }}>Evidence package</a>
                      </div>
                    </div>
                  </article>;
                })}
              </div>
              <div style={{ padding: "10px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <span role="status" style={{ color: MUTED, fontSize: 12 }}>Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} issues</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} style={controls}>Previous</button>
                  <button type="button" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)} style={controls}>Next</button>
                </div>
              </div>
            </>}
    </section>
  );
}
