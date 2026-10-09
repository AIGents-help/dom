"use client";
import { useEffect, useRef, useState } from "react";
import type { InspectionFinding } from "@/lib/dominicInspectionEvidence";
import { type FindingReviewFilter } from "@/lib/dominicFindingQueue";

const control = { border: "1px solid #26323D", borderRadius: 8, padding: "8px 10px", background: "#151E27", color: "#F4F7FA" };
export default function DominicFindingReviewQueue<T extends InspectionFinding>({ findings, loaded, busy, onOpen, onReview, total, matchingTotal, page, filter, onPage, onQuery }: {
  total: number; matchingTotal: number; page: number; filter: FindingReviewFilter; onPage: (page: number) => void; onQuery: (filter: FindingReviewFilter, search: string) => void;
  findings: T[]; loaded: boolean; busy: boolean; onOpen: (finding: T) => void;
  onReview: (id: string, action: "confirm" | "dismiss") => void;
}) {
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSearch = () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  const current = { page, start: page * 12, last: Math.max(0, Math.ceil(matchingTotal / 12) - 1), rows: findings };
  return <section aria-label="Finding review queue" style={{ margin: 12, border: "1px solid #26323D", borderRadius: 9, padding: 12, color: "#F4F7FA" }}>
    <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>Finding review queue</h3>
    <p style={{ fontSize: 12, color: "#8F9CAA" }}>Awaiting review first, then severity and oldest observation. Open the evidence before confirming an issue.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <input aria-label="Search saved findings" placeholder="Search title or description" value={search} maxLength={200} onChange={(event) => { const value = event.target.value; setSearch(value); cancelSearch(); searchTimer.current = setTimeout(() => onQuery(filter, value), 250); }} style={{ ...control, flex: "1 1 180px", minWidth: 0 }} />
      <select aria-label="Finding review status" value={filter} onChange={(event) => { cancelSearch(); onQuery(event.target.value as FindingReviewFilter, search); }} style={control}>
        <option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option>
      </select>
    </div>
    <p role="status" style={{ fontSize: 12 }}>{!loaded ? "Findings unavailable until evidence refresh succeeds." : matchingTotal ? `Showing ${current.start + 1}–${current.start + current.rows.length} of ${matchingTotal} matching findings · ${total} saved total` : "No matching findings."}</p>
    <div style={{ display: "grid", gap: 8 }}>
      {loaded ? current.rows.map((finding) => <article key={finding.id} aria-label={finding.title} style={{ border: "1px solid #26323D", borderRadius: 8, padding: 10, overflowWrap: "anywhere" }}>
        <strong>{finding.title}</strong>
        <p style={{ fontSize: 12, margin: "6px 0" }}>{finding.severity} · {finding.review_status.replaceAll("_", " ")} · {new Date(finding.observed_at).toLocaleString()}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" aria-label={`Review saved finding ${finding.title}`} disabled={busy} onClick={() => onOpen(finding)} style={control}>Open evidence / notes</button>
          {finding.review_status === "needs_review" ? <>
            <button type="button" disabled={busy} onClick={() => onReview(finding.id, "confirm")} style={control}>Confirm Issue</button>
            <button type="button" disabled={busy} onClick={() => onReview(finding.id, "dismiss")} style={control}>Dismiss</button>
          </> : null}
        </div>
      </article>) : null}
    </div>
    {loaded && matchingTotal > 12 ? <nav aria-label="Finding review pages" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <button type="button" disabled={busy || current.page === 0} onClick={() => onPage(0)} style={control}>First finding page</button>
      <button type="button" disabled={busy || current.page === 0} onClick={() => onPage(current.page - 1)} style={control}>Previous findings</button>
      <button type="button" disabled={busy || current.page === current.last} onClick={() => onPage(current.page + 1)} style={control}>Next findings</button>
      <button type="button" disabled={busy || current.page === current.last} onClick={() => onPage(current.last)} style={control}>Last finding page</button>
    </nav> : null}
  </section>;
}
