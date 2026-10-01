"use client";

/* eslint-disable @next/next/no-img-element -- signed private inspection evidence is rendered directly */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock3, Eye, TrendingDown, TrendingUp } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { deriveIssueTrend, issueTrendLabel } from "@/lib/dominicIssueTrend";

const ORANGE = "#F45A1E";
const PANEL = "#10171E";
const PANEL_2 = "#151E27";
const LINE = "#26323D";
const TEXT = "#F4F7FA";
const MUTED = "#8F9CAA";
const GREEN = "#70D6A0";
const AMBER = "#FFB565";
const RED = "#FF7474";

type Issue = {
  id: string;
  asset_id: string;
  title: string;
  issue_type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "open" | "monitoring" | "in_progress" | "resolved" | "verified" | "dismissed";
  recommended_action: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
};

type LinkRow = {
  finding_id: string;
  inspection_id: string;
  relation_type: "discovered" | "observation" | "progression" | "verification";
  linked_at: string;
};

type FindingRow = {
  id: string;
  inspection_id: string;
  title: string;
  description: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number | null;
  sensor_mode: string | null;
  spatial_anchor: Record<string, unknown>;
  observed_at: string;
};

type InspectionRow = {
  id: string;
  inspection_type: string;
  objective: string | null;
  status: string;
  created_at: string;
};

type EvidenceRow = {
  id: string;
  finding_id: string;
  storage_path: string | null;
  mime_type: string | null;
  captured_at: string | null;
};

function severityColor(severity: Issue["severity"]) {
  if (severity === "critical" || severity === "high") return RED;
  if (severity === "medium") return AMBER;
  if (severity === "low") return "#8FC7FF";
  return MUTED;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function DominicIssueIntelligence({
  issue,
  busy = false,
  onReinspect,
}: {
  issue: Issue;
  busy?: boolean;
  onReinspect?: (issue: Issue) => void;
}) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: linkData, error: linkError } = await sb
        .from("dominic_issue_findings")
        .select("finding_id,inspection_id,relation_type,linked_at")
        .eq("issue_id", issue.id)
        .order("linked_at", { ascending: true });
      if (linkError) throw linkError;

      const nextLinks = (linkData ?? []) as LinkRow[];
      setLinks(nextLinks);

      const findingIds = nextLinks.map((item) => item.finding_id);
      const inspectionIds = Array.from(new Set(nextLinks.map((item) => item.inspection_id)));

      const [findingResult, inspectionResult, evidenceResult] = await Promise.all([
        findingIds.length
          ? sb
              .from("dominic_findings")
              .select("id,inspection_id,title,description,severity,confidence,sensor_mode,spatial_anchor,observed_at")
              .in("id", findingIds)
              .order("observed_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        inspectionIds.length
          ? sb
              .from("dominic_inspections")
              .select("id,inspection_type,objective,status,created_at")
              .in("id", inspectionIds)
          : Promise.resolve({ data: [], error: null }),
        findingIds.length
          ? sb
              .from("dominic_finding_evidence")
              .select("id,finding_id,storage_path,mime_type,captured_at")
              .in("finding_id", findingIds)
              .order("captured_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (findingResult.error) throw findingResult.error;
      if (inspectionResult.error) throw inspectionResult.error;
      if (evidenceResult.error) throw evidenceResult.error;

      const nextFindings = (findingResult.data ?? []) as FindingRow[];
      const nextInspections = (inspectionResult.data ?? []) as InspectionRow[];
      const nextEvidence = (evidenceResult.data ?? []) as EvidenceRow[];
      setFindings(nextFindings);
      setInspections(nextInspections);
      setEvidence(nextEvidence);

      const urls = await Promise.all(
        nextEvidence
          .filter((item) => item.storage_path && item.mime_type?.startsWith("image/"))
          .map(async (item) => {
            const { data } = await sb.storage
              .from("pilot-media")
              .createSignedUrl(item.storage_path as string, 900);
            return [item.id, data?.signedUrl ?? ""] as const;
          }),
      );
      setSignedUrls(Object.fromEntries(urls.filter(([, url]) => Boolean(url))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Issue history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [issue.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const trend = useMemo(
    () =>
      deriveIssueTrend(
        findings.map((finding) => ({
          severity: finding.severity,
          confidence: finding.confidence,
          observedAt: finding.observed_at,
        })),
      ),
    [findings],
  );

  const trendColor =
    trend.trend === "worsening"
      ? RED
      : trend.trend === "improving"
        ? GREEN
        : trend.trend === "persistent"
          ? AMBER
          : MUTED;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: PANEL, overflow: "hidden" }}>
      <div style={{ padding: "11px 12px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ color: ORANGE, fontSize: 8, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>
          Issue Intelligence
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", marginTop: 4, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: TEXT, fontSize: 13, fontWeight: 900 }}>{issue.title}</div>
            <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
              {issue.issue_type.replaceAll("_", " ")} · {issue.status.replaceAll("_", " ")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onReinspect && ["open", "monitoring", "in_progress"].includes(issue.status) ? (
              <button
                type="button"
                onClick={() => onReinspect(issue)}
                disabled={busy}
                style={{
                  border: "1px solid rgba(244,90,30,.42)",
                  background: "rgba(244,90,30,.10)",
                  color: "#FFD3C0",
                  borderRadius: 7,
                  padding: "6px 8px",
                  fontSize: 8,
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {busy ? "Creating…" : "Reinspect Issue"}
              </button>
            ) : null}
            <div style={{ textAlign: "right" }}>
              <div style={{ color: severityColor(issue.severity), fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>
                {issue.severity}
              </div>
              <div style={{ color: trendColor, fontSize: 8, fontWeight: 900, marginTop: 3, textTransform: "uppercase", display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                {trend.trend === "worsening" ? <TrendingUp size={11} /> : trend.trend === "improving" ? <TrendingDown size={11} /> : <Activity size={11} />}
                {issueTrendLabel(trend.trend)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, borderBottom: `1px solid ${LINE}` }}>
        {[
          ["Observations", String(trend.observationCount)],
          ["First seen", formatDate(trend.firstObservedAt ?? issue.first_seen_at)],
          ["Last seen", formatDate(trend.latestObservedAt ?? issue.last_seen_at)],
        ].map(([label, value]) => (
          <div key={label} style={{ border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL_2, padding: 8 }}>
            <div style={{ color: MUTED, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
            <div style={{ color: TEXT, fontSize: 10, fontWeight: 900, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      {issue.recommended_action ? (
        <div style={{ padding: "9px 11px", borderBottom: `1px solid ${LINE}`, background: "rgba(244,90,30,.04)" }}>
          <div style={{ color: MUTED, fontSize: 7, textTransform: "uppercase", fontWeight: 900 }}>Recommended action</div>
          <div style={{ color: "#DDE4EA", fontSize: 9, lineHeight: 1.45, marginTop: 4 }}>{issue.recommended_action}</div>
        </div>
      ) : null}

      {message ? (
        <div style={{ margin: 10, border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL_2, color: MUTED, padding: 8, fontSize: 8 }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>Loading issue history…</div>
      ) : findings.length === 0 ? (
        <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>No linked observations are available yet.</div>
      ) : (
        <div style={{ padding: 10, display: "grid", gap: 8 }}>
          {findings.map((finding, index) => {
            const inspection = inspections.find((item) => item.id === finding.inspection_id) ?? null;
            const linkedEvidence = evidence.filter((item) => item.finding_id === finding.id);
            const relation = links.find((item) => item.finding_id === finding.id)?.relation_type ?? "observation";
            return (
              <div key={finding.id} style={{ border: `1px solid ${LINE}`, borderRadius: 9, background: PANEL_2, overflow: "hidden" }}>
                <div style={{ padding: 9, display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto", gap: 8, alignItems: "start" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(244,90,30,.12)", color: ORANGE, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 900 }}>
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ color: TEXT, fontSize: 9, fontWeight: 900 }}>{finding.title}</div>
                    <div style={{ color: MUTED, fontSize: 7, marginTop: 2 }}>
                      {formatDate(finding.observed_at)} · {inspection?.inspection_type.replaceAll("_", " ") ?? "inspection"} · {relation}
                    </div>
                    {finding.description ? (
                      <div style={{ color: "#C9D2D9", fontSize: 8, lineHeight: 1.4, marginTop: 5 }}>{finding.description}</div>
                    ) : null}
                  </div>
                  <div style={{ color: severityColor(finding.severity), fontSize: 7, fontWeight: 900, textTransform: "uppercase" }}>
                    {finding.severity}
                    {finding.confidence !== null ? <div style={{ color: MUTED, marginTop: 3 }}>{Math.round(finding.confidence * 100)}%</div> : null}
                  </div>
                </div>

                {linkedEvidence.some((item) => signedUrls[item.id]) ? (
                  <div style={{ borderTop: `1px solid ${LINE}`, padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6 }}>
                    {linkedEvidence.map((item) =>
                      signedUrls[item.id] ? (
                        <div key={item.id} style={{ border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden", background: "#070A0D" }}>
                          <img src={signedUrls[item.id]} alt="Issue evidence" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                          <div style={{ padding: "5px 6px", color: MUTED, fontSize: 7, display: "flex", alignItems: "center", gap: 4 }}>
                            <Eye size={10} /> {formatDate(item.captured_at)}
                          </div>
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: "8px 10px", borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 7, display: "flex", gap: 5, alignItems: "center" }}>
        {trend.trend === "worsening" ? <AlertTriangle size={11} color={RED} /> : <Clock3 size={11} color={MUTED} />}
        Trend is derived from confirmed observation severity over time; it is not an engineering diagnosis.
      </div>
    </div>
  );
}
