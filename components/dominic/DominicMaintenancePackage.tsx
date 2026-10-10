"use client";

/* eslint-disable @next/next/no-img-element -- signed private inspection evidence is rendered directly */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  MapPin,
  Printer,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { issueLifecycleLabel } from "@/lib/dominicIssueLifecycle";

type Evidence = {
  id: string;
  source: "inspection_media" | "finding_evidence";
  role: string;
  sequenceId: string | null;
  storagePath: string | null;
  signedUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sensorMode: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  relativeAltitudeFt: number | null;
  sourceAircraftId: string | null;
  analysisStatus: string | null;
};

type Observation = {
  link: {
    finding_id: string;
    inspection_id: string;
    relation_type: string;
    linked_at: string;
  } | null;
  finding: {
    id: string;
    inspection_id: string;
    finding_type: string;
    title: string;
    description: string | null;
    severity: string;
    review_status: string;
    confidence: number | null;
    sensor_mode: string | null;
    observed_at: string;
  };
  inspection: {
    id: string;
    inspection_type: string;
    objective: string | null;
    status: string;
    capture_source: string;
    sensor_modes: string[];
    started_at: string | null;
    completed_at: string | null;
    summary: string | null;
    created_at: string;
  } | null;
  target: {
    latitude: number;
    longitude: number;
    distanceM: number | null;
    source: string;
  } | null;
  comparison: {
    state: string | null;
    note: string | null;
  };
  evidence: Evidence[];
};

type PackagePayload = {
  generatedAt: string;
  asset: {
    id: string;
    name: string;
    asset_type: string;
    external_ref: string | null;
    description: string | null;
    status: string;
    condition_state: string;
    condition_score: number | null;
    condition_updated_at: string | null;
    location_label: string | null;
    latitude: number | null;
    longitude: number | null;
    altitude_ft: number | null;
    baseline_at: string | null;
    last_inspected_at: string | null;
    next_inspection_due_at: string | null;
  };
  issue: {
    id: string;
    asset_id: string;
    issue_type: string;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    confidence: number | null;
    recommended_action: string | null;
    first_seen_at: string;
    last_seen_at: string;
    resolved_at: string | null;
    verified_at: string | null;
    resolution_notes: string | null;
    metadata: Record<string, unknown>;
  };
  maintenanceReview: {
    priority: string;
    label: string;
    score: number;
    reasons: string[];
    unresolvedDays: number | null;
  };
  trend: {
    trend: string;
    label: string;
    observationCount: number;
    firstObservedAt: string | null;
    latestObservedAt: string | null;
  };
  observations: Observation[];
  verification: {
    inspection: {
      id: string;
      inspection_type: string;
      objective: string | null;
      status: string;
      capture_source: string;
      sensor_modes: string[];
      started_at: string | null;
      completed_at: string | null;
      summary: string | null;
      created_at: string;
    };
    assessment: {
      status: string;
      canVerify: boolean;
      shouldReopen: boolean;
      reasons: string[];
    };
    findings: Array<{
      id: string;
      title: string;
      severity: string;
      review_status: string;
    }>;
    counts: { total: number; confirmed: number; dismissed: number; pending: number; mediaTotal: number } | null;
    evidence: Evidence[];
  } | null;
  events: Array<{
    id: string;
    inspection_id: string | null;
    finding_id: string | null;
    event_type: string;
    summary: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
};

function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function priorityColor(priority: string) {
  if (priority === "attention_now") return "#B3261E";
  if (priority === "elevated") return "#A15C00";
  if (priority === "routine") return "#245A8D";
  return "#65717E";
}

function severityColor(severity: string) {
  if (severity === "critical" || severity === "high") return "#B3261E";
  if (severity === "medium") return "#A15C00";
  if (severity === "low") return "#245A8D";
  return "#65717E";
}

function comparisonColor(state: string | null) {
  if (state === "worsening" || state === "failed") return "#B3261E";
  if (state === "improving" || state === "improved" || state === "cleared") return "#1F7A52";
  if (state === "unchanged") return "#245A8D";
  if (state === "needs_review" || state === "capturing") return "#A15C00";
  return "#65717E";
}

export default function DominicMaintenancePackage({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PackagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = getSupabaseBrowser();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          router.replace("/dominic/login");
          return;
        }

        const response = await fetch(
          `/api/dominic/issues/${issueId}/maintenance-package`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error ?? "Maintenance package could not be loaded.");
        }
        if (!active) return;
        setData(body as PackagePayload);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Maintenance package could not be loaded.",
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [issueId, router]);

  useEffect(() => {
    if (!data) return;
    const previousTitle = document.title;
    document.title = `DOMINIC - ${data.asset.name} - Maintenance Package`;
    return () => {
      document.title = previousTitle;
    };
  }, [data]);

  const latestTarget = useMemo(
    () =>
      [...(data?.observations ?? [])]
        .reverse()
        .find((observation) => observation.target)?.target ?? null,
    [data],
  );

  const evidenceCount = useMemo(
    () =>
      (data?.observations ?? []).reduce(
        (total, observation) => total + observation.evidence.length,
        0,
      ) + (data?.verification?.evidence.length ?? 0),
    [data],
  );

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#E9EDF1", padding: 28, color: "#B3261E" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "#E9EDF1", padding: 28, color: "#65717E" }}>
        Assembling maintenance package…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#E9EDF1", padding: "22px 14px", color: "#172033" }}>
      <style>{`
        @media print {
          .dominic-maintenance-actions { display: none !important; }
          body { background: #fff !important; }
          @page { size: letter; margin: 11mm; }
          .dominic-maintenance-sheet { box-shadow: none !important; border-radius: 0 !important; }
          .dominic-maintenance-keep, .dominic-evidence-card { break-inside: avoid; page-break-inside: avoid; }
          h2, h3 { break-after: avoid; page-break-after: avoid; }
          img { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <div
        className="dominic-maintenance-actions"
        style={{
          maxWidth: 1040,
          margin: "0 auto 12px",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={() => router.push("/dominic")} style={actionStyle}>
          <ArrowLeft size={15} /> Back to DOMINIC
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ ...actionStyle, background: "#F45A1E", borderColor: "#F45A1E", color: "#fff" }}
        >
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <main
        className="dominic-maintenance-sheet"
        style={{
          position: "relative",
          maxWidth: 1040,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 20px 70px rgba(0,0,0,.12)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: 0,
          }}
        >
          <div
            style={{
              transform: "rotate(-31deg)",
              fontSize: 72,
              fontWeight: 950,
              letterSpacing: ".08em",
              color: "rgba(244,90,30,.028)",
              whiteSpace: "nowrap",
            }}
          >
            DOMINIC · ASSET INTELLIGENCE
          </div>
        </div>

        <header
          style={{
            position: "relative",
            zIndex: 1,
            background: "#090D11",
            color: "#fff",
            padding: "26px 30px",
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <div>
            <DominicBrandLockup size="sm" />
            <div style={{ color: "#F45A1E", fontSize: 9, fontWeight: 900, marginTop: 7 }}>
              ASSET INTELLIGENCE · MAINTENANCE EVIDENCE
            </div>
            <h1 style={{ margin: "22px 0 0", fontSize: 28 }}>{data.asset.name}</h1>
            <div style={{ color: "#C0C9D1", marginTop: 5, fontSize: 12 }}>
              {data.issue.title}
            </div>
          </div>
          <div style={{ textAlign: "right", color: "#BAC4CE", fontSize: 10, lineHeight: 1.6 }}>
            <div style={{ color: "#fff", fontWeight: 850 }}>Maintenance Evidence Package</div>
            <div>Issue {data.issue.id.slice(0, 8).toUpperCase()}</div>
            <div>Generated {formatDateTime(data.generatedAt)}</div>
          </div>
        </header>

        <section style={{ position: "relative", zIndex: 1, padding: 30 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 9,
              marginBottom: 24,
            }}
          >
            <Metric label="Maintenance Priority" value={data.maintenanceReview.label} tone={priorityColor(data.maintenanceReview.priority)} />
            <Metric label="Issue Severity" value={titleCase(data.issue.severity)} tone={severityColor(data.issue.severity)} />
            <Metric label="Observations" value={String(data.trend.observationCount)} />
            <Metric label="Evidence Frames" value={String(evidenceCount)} />
            <Metric label="Progression" value={data.trend.label} />
          </div>

          <div
            className="dominic-maintenance-keep"
            style={{
              border: `1px solid ${priorityColor(data.maintenanceReview.priority)}55`,
              borderLeft: `5px solid ${priorityColor(data.maintenanceReview.priority)}`,
              borderRadius: 10,
              padding: 14,
              background: "#F8FAFB",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <ShieldAlert size={18} color={priorityColor(data.maintenanceReview.priority)} />
              <div>
                <div style={{ fontSize: 10, color: "#65717E", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  DOMINIC Maintenance Review
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: priorityColor(data.maintenanceReview.priority), marginTop: 2 }}>
                  {data.maintenanceReview.label}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 9, fontSize: 11, lineHeight: 1.55, color: "#3D4955" }}>
              {data.maintenanceReview.reasons.length
                ? data.maintenanceReview.reasons.join(" ")
                : "No escalation signal beyond the confirmed issue state."}
            </div>
          </div>

          <SectionTitle>Asset & Issue Identification</SectionTitle>
          <table style={tableStyle}>
            <tbody>
              <Row k="Asset" v={data.asset.name} />
              <Row k="Asset type" v={titleCase(data.asset.asset_type)} />
              <Row k="Asset tag / reference" v={data.asset.external_ref ?? "—"} />
              <Row k="Facility location" v={data.asset.location_label ?? "—"} />
              <Row
                k="Asset coordinates"
                v={
                  data.asset.latitude != null && data.asset.longitude != null
                    ? `${Number(data.asset.latitude).toFixed(6)}, ${Number(data.asset.longitude).toFixed(6)}`
                    : "—"
                }
              />
              <Row k="Asset condition" v={titleCase(data.asset.condition_state)} />
              <Row k="Issue type" v={titleCase(data.issue.issue_type)} />
              <Row k="Issue status" v={issueLifecycleLabel(data.issue)} />
              <Row k="First observed" v={formatDateTime(data.issue.first_seen_at)} />
              <Row k="Last observed" v={formatDateTime(data.issue.last_seen_at)} />
            </tbody>
          </table>

          <SectionTitle>Problem Statement</SectionTitle>
          <div className="dominic-maintenance-keep" style={narrativeStyle}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{data.issue.title}</div>
            <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.6, color: "#3D4955" }}>
              {data.issue.description ?? "No additional issue description was recorded."}
            </div>
            {data.issue.confidence !== null ? (
              <div style={{ marginTop: 8, fontSize: 10, color: "#65717E" }}>
                Latest recorded confidence: {Math.round(data.issue.confidence * 100)}%
              </div>
            ) : null}
          </div>

          <SectionTitle>Recommended Maintenance Action</SectionTitle>
          <div className="dominic-maintenance-keep" style={{ ...narrativeStyle, borderLeft: "4px solid #F45A1E" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Wrench size={17} color="#F45A1E" />
              <div style={{ fontSize: 12, lineHeight: 1.6, fontWeight: 700 }}>
                {data.issue.recommended_action ?? "No specific maintenance action has been recorded yet."}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 9, lineHeight: 1.5, color: "#65717E" }}>
              This action is carried with the operator-confirmed DOMINIC issue record. Final maintenance, engineering, process-safety, and return-to-service decisions remain with the responsible facility personnel.
            </div>
          </div>

          <SectionTitle>Exact Problem Location</SectionTitle>
          <div className="dominic-maintenance-keep" style={narrativeStyle}>
            {latestTarget ? (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <MapPin size={18} color="#1F7A52" />
                <div>
                  <div style={{ fontWeight: 850 }}>
                    {latestTarget.latitude.toFixed(6)}, {latestTarget.longitude.toFixed(6)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: "#65717E" }}>
                    {latestTarget.source === "laser_localized"
                      ? "Laser-localized inspection target"
                      : "Finding location"}
                    {latestTarget.distanceM !== null
                      ? ` · ${latestTarget.distanceM.toFixed(1)} m measured distance`
                      : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#65717E" }}>
                No finding-specific geospatial target was recorded. Use the asset location and visual context evidence below.
              </div>
            )}
          </div>

          <SectionTitle>Inspection Evidence</SectionTitle>
          {data.observations.length === 0 ? (
            <Empty>No linked confirmed observations are available.</Empty>
          ) : (
            data.observations.map((observation, index) => (
              <div
                key={observation.finding.id}
                className="dominic-maintenance-keep"
                style={{
                  border: "1px solid #D9E0E6",
                  borderRadius: 12,
                  overflow: "hidden",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    background: "#F5F7F9",
                    padding: "11px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 9, color: "#65717E", textTransform: "uppercase", fontWeight: 850 }}>
                      Observation {index + 1} · {titleCase(observation.link?.relation_type ?? "observation")}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, marginTop: 3 }}>
                      {observation.finding.title}
                    </div>
                    <div style={{ fontSize: 9, color: "#65717E", marginTop: 4 }}>
                      {formatDateTime(observation.finding.observed_at)}
                      {observation.inspection
                        ? ` · ${titleCase(observation.inspection.inspection_type)} inspection`
                        : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: severityColor(observation.finding.severity), fontWeight: 900, fontSize: 10, textTransform: "uppercase" }}>
                      {observation.finding.severity}
                    </div>
                    <div style={{ color: "#1F7A52", fontSize: 8, fontWeight: 850, marginTop: 3, textTransform: "uppercase" }}>
                      {titleCase(observation.finding.review_status)}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12 }}>
                  {observation.finding.description ? (
                    <div style={{ fontSize: 10, lineHeight: 1.55, color: "#3D4955", marginBottom: 9 }}>
                      {observation.finding.description}
                    </div>
                  ) : null}

                  {observation.comparison.state ? (
                    <div
                      style={{
                        borderLeft: `3px solid ${comparisonColor(observation.comparison.state)}`,
                        paddingLeft: 9,
                        marginBottom: 10,
                        fontSize: 9,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: comparisonColor(observation.comparison.state) }}>
                        {observation.comparison.state === "new"
                          ? "First observation"
                          : `Compared with prior evidence: ${titleCase(observation.comparison.state)}`}
                      </strong>
                      {observation.comparison.note ? (
                        <div style={{ color: "#65717E", marginTop: 2 }}>
                          {observation.comparison.note}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {observation.target ? (
                    <div style={{ color: "#1F7A52", fontSize: 9, marginBottom: 10 }}>
                      <MapPin size={11} style={{ display: "inline", marginRight: 4 }} />
                      {observation.target.latitude.toFixed(6)}, {observation.target.longitude.toFixed(6)}
                      {observation.target.distanceM !== null
                        ? ` · ${observation.target.distanceM.toFixed(1)} m`
                        : ""}
                    </div>
                  ) : null}

                  {observation.evidence.length ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                        gap: 9,
                      }}
                    >
                      {observation.evidence.map((evidence) => (
                        <div
                          key={evidence.id}
                          className="dominic-evidence-card"
                          style={{
                            border: "1px solid #D9E0E6",
                            borderRadius: 9,
                            overflow: "hidden",
                            background: "#FAFBFC",
                          }}
                        >
                          {evidence.signedUrl && evidence.mimeType?.startsWith("image/") ? (
                            <img
                              src={evidence.signedUrl}
                              alt={`${evidence.role} inspection evidence`}
                              style={{
                                width: "100%",
                                height: 210,
                                objectFit: "contain",
                                display: "block",
                                background: "#090D11",
                              }}
                            />
                          ) : (
                            <div style={{ height: 110, display: "grid", placeItems: "center", color: "#65717E", fontSize: 10 }}>
                              Evidence file recorded
                            </div>
                          )}
                          <div style={{ padding: 9 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                              <span
                                style={{
                                  border: "1px solid #D9E0E6",
                                  borderRadius: 999,
                                  padding: "3px 6px",
                                  fontSize: 8,
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  color: evidence.role === "detail" ? "#B84A1D" : evidence.role === "context" ? "#1F7A52" : "#65717E",
                                }}
                              >
                                {titleCase(evidence.role)}
                              </span>
                              <span style={{ color: "#65717E", fontSize: 8 }}>
                                {titleCase(evidence.sensorMode)}
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: "#3D4955", marginTop: 7 }}>
                              <Eye size={11} style={{ display: "inline", marginRight: 4 }} />
                              {formatDateTime(evidence.capturedAt)}
                            </div>
                            {evidence.sequenceId ? (
                              <div style={{ fontSize: 8, color: "#65717E", marginTop: 4 }}>
                                Linked context/detail sequence
                              </div>
                            ) : null}
                            {evidence.sourceAircraftId ? (
                              <div style={{ fontSize: 8, color: "#65717E", marginTop: 3 }}>
                                Aircraft: {evidence.sourceAircraftId}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "#65717E", fontSize: 10 }}>
                      No stored image evidence is linked to this observation.
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          <SectionTitle>Progression Timeline</SectionTitle>
          {data.observations.length === 0 ? (
            <Empty>No progression history recorded.</Empty>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Inspection</Th>
                  <Th>Relation</Th>
                  <Th>Change</Th>
                  <Th>Severity</Th>
                </tr>
              </thead>
              <tbody>
                {data.observations.map((observation) => (
                  <tr key={observation.finding.id}>
                    <Td>{formatDate(observation.finding.observed_at)}</Td>
                    <Td>{titleCase(observation.inspection?.inspection_type ?? "inspection")}</Td>
                    <Td>{titleCase(observation.link?.relation_type ?? "observation")}</Td>
                    <Td>{titleCase(observation.comparison.state ?? "not compared")}</Td>
                    <Td>{titleCase(observation.finding.severity)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <SectionTitle>Maintenance Closure & Verification</SectionTitle>
          {!data.issue.resolution_notes && !data.verification ? (
            <Empty>Maintenance has not yet been recorded complete for this issue.</Empty>
          ) : (
            <>
              {data.issue.resolution_notes ? (
                <div className="dominic-maintenance-keep" style={{ ...narrativeStyle, borderLeft: "4px solid #F45A1E" }}>
                  <div style={{ fontSize: 9, color: "#65717E", textTransform: "uppercase", fontWeight: 850 }}>
                    Maintenance performed
                  </div>
                  <div style={{ fontSize: 11, color: "#3D4955", lineHeight: 1.6, marginTop: 5 }}>
                    {data.issue.resolution_notes}
                  </div>
                  {typeof data.issue.metadata?.maintenanceWorkOrder === "string" && data.issue.metadata.maintenanceWorkOrder ? (
                    <div style={{ fontSize: 9, color: "#65717E", marginTop: 6 }}>
                      Work order / reference: {String(data.issue.metadata.maintenanceWorkOrder)}
                    </div>
                  ) : null}
                  {data.issue.resolved_at ? (
                    <div style={{ fontSize: 9, color: "#65717E", marginTop: 6 }}>
                      Recorded complete {formatDateTime(data.issue.resolved_at)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {data.verification ? (
                <div className="dominic-maintenance-keep" style={{ border: "1px solid #D9E0E6", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
                  <div style={{ background: "#F5F7F9", padding: "11px 12px", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#65717E", textTransform: "uppercase", fontWeight: 850 }}>
                        Post-maintenance verification
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, marginTop: 3 }}>
                        {data.verification.inspection.objective ?? "Verification inspection"}
                      </div>
                      <div style={{ fontSize: 9, color: "#65717E", marginTop: 4 }}>
                        {formatDateTime(data.verification.inspection.created_at)} · {titleCase(data.verification.inspection.status)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: comparisonColor(data.verification.assessment.status), fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
                        {titleCase(data.verification.assessment.status)}
                      </div>
                      {data.issue.verified_at ? (
                        <div style={{ color: "#1F7A52", fontSize: 8, fontWeight: 850, marginTop: 3 }}>
                          Verified {formatDateTime(data.issue.verified_at)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 10, lineHeight: 1.55, color: "#3D4955" }}>
                      {data.verification.assessment.reasons.join(" ")}
                    </div>
                    {data.verification.counts && data.verification.counts.total > 0 ? (
                      <div style={{ marginTop: 8, fontSize: 9, color: "#65717E" }}>
                        Verification review: {data.verification.counts.confirmed} confirmed · {data.verification.counts.dismissed} dismissed · {data.verification.counts.pending} pending
                      </div>
                    ) : data.verification.assessment.status === "cleared" ? (
                      <div style={{ marginTop: 8, fontSize: 9, color: "#1F7A52" }}>
                        No remaining candidate anomaly was recorded in the verification inspection.
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 9, color: "#65717E" }}>
                        No current verification findings have been recorded yet.
                      </div>
                    )}
                    {typeof data.issue.metadata?.verificationNotes === "string" && data.issue.metadata.verificationNotes ? (
                      <div style={{ marginTop: 8, fontSize: 9, color: "#3D4955", lineHeight: 1.5 }}>
                        Operator verification note: {String(data.issue.metadata.verificationNotes)}
                      </div>
                    ) : null}

                    {data.verification.evidence.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 9, marginTop: 12 }}>
                        {data.verification.evidence.map((evidence) => (
                          <div key={evidence.id} className="dominic-evidence-card" style={{ border: "1px solid #D9E0E6", borderRadius: 9, overflow: "hidden", background: "#FAFBFC" }}>
                            {evidence.signedUrl && evidence.mimeType?.startsWith("image/") ? (
                              <img
                                src={evidence.signedUrl}
                                alt="Post-maintenance verification evidence"
                                style={{ width: "100%", height: 210, objectFit: "contain", display: "block", background: "#090D11" }}
                              />
                            ) : (
                              <div style={{ height: 110, display: "grid", placeItems: "center", color: "#65717E", fontSize: 10 }}>
                                Verification evidence file recorded
                              </div>
                            )}
                            <div style={{ padding: 9 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", color: evidence.role === "detail" ? "#B84A1D" : evidence.role === "context" ? "#1F7A52" : "#65717E" }}>
                                  {titleCase(evidence.role)}
                                </span>
                                <span style={{ color: "#65717E", fontSize: 8 }}>{titleCase(evidence.sensorMode)}</span>
                              </div>
                              <div style={{ fontSize: 9, color: "#3D4955", marginTop: 6 }}>
                                <Eye size={11} style={{ display: "inline", marginRight: 4 }} />
                                {formatDateTime(evidence.capturedAt)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, color: "#65717E", fontSize: 10 }}>
                        No verification media has been stored yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}

          <SectionTitle>Issue Audit Trail</SectionTitle>
          {data.events.length === 0 ? (
            <Empty>No issue events recorded.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 7 }}>
              {data.events.map((event) => (
                <div
                  key={event.id}
                  className="dominic-maintenance-keep"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "130px minmax(0,1fr)",
                    gap: 10,
                    borderBottom: "1px solid #E5E9ED",
                    padding: "8px 0",
                  }}
                >
                  <div style={{ color: "#65717E", fontSize: 9 }}>{formatDateTime(event.created_at)}</div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#F45A1E" }}>
                      {titleCase(event.event_type)}
                    </div>
                    <div style={{ fontSize: 10, color: "#3D4955", marginTop: 2, lineHeight: 1.45 }}>
                      {event.summary}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 30,
              paddingTop: 16,
              borderTop: "1px solid #D9E0E6",
              color: "#65717E",
              fontSize: 9,
              lineHeight: 1.55,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 850, color: "#3D4955", marginBottom: 5 }}>
              <AlertTriangle size={13} /> DOMINIC maintenance evidence notice
            </div>
            This package documents confirmed inspection observations, visual/thermal evidence when available, issue progression, and an operator-facing maintenance review priority. DOMINIC maintenance priority and progression are inspection triage aids, not engineering diagnoses, process-safety determinations, or authorization to return equipment to service. Facility procedures, qualified personnel, OEM requirements, and applicable regulations control maintenance and operational decisions.
            <div style={{ marginTop: 7 }}>
              DOMINIC™ · Drone Operation Management · DroneOpsMan.com · Asset {data.asset.id} · Issue {data.issue.id}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const actionStyle = {
  border: "1px solid #34404C",
  background: "#10161D",
  color: "#F5F7FA",
  borderRadius: 9,
  padding: "9px 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  fontWeight: 750,
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: 22,
  fontSize: 11,
} as const;

const narrativeStyle = {
  border: "1px solid #D9E0E6",
  borderRadius: 10,
  padding: 14,
  background: "#F8FAFB",
  marginBottom: 22,
} as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: "23px 0 9px",
        fontSize: 16,
        borderBottom: "2px solid #F45A1E",
        paddingBottom: 6,
      }}
    >
      {children}
    </h2>
  );
}

function Metric({
  label,
  value,
  tone = "#172033",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div style={{ border: "1px solid #D9E0E6", borderRadius: 10, padding: 11, minHeight: 66 }}>
      <div style={{ fontSize: 17, fontWeight: 900, color: tone }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 8, color: "#65717E", textTransform: "uppercase", letterSpacing: ".06em" }}>
        {label}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <Td strong>{k}</Td>
      <Td>{v}</Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 9px",
        background: "#F3F6F8",
        borderBottom: "1px solid #D9E0E6",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: ".05em",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td
      style={{
        padding: "8px 9px",
        borderBottom: "1px solid #E5E9ED",
        fontWeight: strong ? 800 : 400,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#65717E", fontSize: 11, marginBottom: 22 }}>{children}</p>;
}
