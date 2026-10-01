"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  Factory,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ThermometerSun,
  Wrench,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import {
  evaluateInspectionReadiness,
  inspectionCapabilityLabel,
  inspectionRequirements,
  mergeInspectionCapabilities,
  type InspectionType,
} from "@/lib/aircraft/inspectionCapabilities";
import type { DominicInspectionPlanningContext } from "@/lib/dominicInspection";
import DominicInspectionEvidenceReview from "@/components/dominic/DominicInspectionEvidenceReview";
import DominicIssueIntelligence from "@/components/dominic/DominicIssueIntelligence";

const ORANGE = "#F45A1E";
const BG = "#0B1117";
const PANEL = "#10171E";
const PANEL_2 = "#151E27";
const LINE = "#26323D";
const TEXT = "#F4F7FA";
const MUTED = "#8F9CAA";
const GREEN = "#70D6A0";
const AMBER = "#FFB565";
const RED = "#FF7474";

type AssetRow = {
  id: string;
  name: string;
  asset_type: string;
  external_ref: string | null;
  description: string | null;
  status: "active" | "monitoring" | "retired";
  condition_state: "unknown" | "normal" | "watch" | "degraded" | "critical";
  condition_score: number | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  last_inspected_at: string | null;
  next_inspection_due_at: string | null;
  updated_at: string;
};

type InspectionRow = {
  id: string;
  asset_id: string;
  inspection_type: string;
  objective: string | null;
  status: "planned" | "capturing" | "analyzing" | "review" | "complete" | "cancelled";
  capture_source: "map" | "live_drone" | "local_object" | "manual" | "dock" | "upload";
  sensor_modes: string[];
  health_score: number | null;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
  required_capabilities: string[];
  optional_capabilities: string[];
  capability_snapshot: Record<string, unknown>;
};

type PilotAssetRow = {
  id: string;
  manufacturer: string | null;
  model: string | null;
  display_name: string | null;
  capabilities_verified: boolean;
};

type PilotAssetCapabilityRow = {
  asset_id: string;
  capability: string;
};

type InspectionEquipmentRow = {
  inspection_id: string;
  pilot_asset_id: string;
  role: string;
  capabilities_snapshot: Record<string, unknown>;
};

type FindingRow = {
  id: string;
  asset_id: string;
  inspection_id: string;
  finding_type: string;
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode: string | null;
  observed_at: string;
};

type IssueRow = {
  id: string;
  asset_id: string;
  issue_type: string;
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "open" | "monitoring" | "in_progress" | "resolved" | "verified" | "dismissed";
  recommended_action: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
};

type NewAssetForm = {
  name: string;
  assetType: string;
  externalRef: string;
  location: string;
};

const emptyAssetForm: NewAssetForm = {
  name: "",
  assetType: "equipment",
  externalRef: "",
  location: "",
};

function severityColor(severity: IssueRow["severity"] | FindingRow["severity"]) {
  if (severity === "critical" || severity === "high") return RED;
  if (severity === "medium") return AMBER;
  return severity === "low" ? "#8FC7FF" : MUTED;
}

function conditionColor(condition: AssetRow["condition_state"]) {
  if (condition === "critical") return RED;
  if (condition === "degraded" || condition === "watch") return AMBER;
  if (condition === "normal") return GREEN;
  return MUTED;
}

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        background: PANEL,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function DominicAssetIntelligence({
  onPlanInspection,
}: {
  onPlanInspection?: (context: DominicInspectionPlanningContext) => void;
}) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [pilotAssets, setPilotAssets] = useState<PilotAssetRow[]>([]);
  const [pilotAssetCapabilities, setPilotAssetCapabilities] = useState<PilotAssetCapabilityRow[]>([]);
  const [inspectionEquipment, setInspectionEquipment] = useState<InspectionEquipmentRow[]>([]);
  const [selectedPilotAssetId, setSelectedPilotAssetId] = useState<string>("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [assetForm, setAssetForm] = useState<NewAssetForm>(emptyAssetForm);
  const [inspectionType, setInspectionType] = useState("visual");
  const [inspectionObjective, setInspectionObjective] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session?.user.id) throw new Error("Your DOMINIC session expired.");

      const [
        assetResult,
        inspectionResult,
        findingResult,
        issueResult,
        pilotAssetResult,
        pilotCapabilityResult,
        equipmentResult,
      ] = await Promise.all([
        sb
          .from("dominic_assets")
          .select("id,name,asset_type,external_ref,description,status,condition_state,condition_score,location_label,latitude,longitude,last_inspected_at,next_inspection_due_at,updated_at")
          .order("updated_at", { ascending: false }),
        sb
          .from("dominic_inspections")
          .select("id,asset_id,inspection_type,objective,status,capture_source,sensor_modes,health_score,summary,created_at,completed_at,required_capabilities,optional_capabilities,capability_snapshot")
          .order("created_at", { ascending: false })
          .limit(100),
        sb
          .from("dominic_findings")
          .select("id,asset_id,inspection_id,finding_type,title,severity,review_status,confidence,sensor_mode,observed_at")
          .order("observed_at", { ascending: false })
          .limit(100),
        sb
          .from("dominic_issues")
          .select("id,asset_id,issue_type,title,severity,status,recommended_action,first_seen_at,last_seen_at,metadata")
          .order("last_seen_at", { ascending: false })
          .limit(100),
        sb
          .from("pilot_assets")
          .select("id,manufacturer,model,display_name,capabilities_verified")
          .eq("asset_type", "uav")
          .eq("status", "active")
          .is("archived_at", null)
          .order("created_at", { ascending: false }),
        sb
          .from("pilot_asset_capabilities")
          .select("asset_id,capability"),
        sb
          .from("dominic_inspection_equipment")
          .select("inspection_id,pilot_asset_id,role,capabilities_snapshot")
          .eq("role", "aircraft")
          .order("selected_at", { ascending: false }),
      ]);

      if (assetResult.error) throw assetResult.error;
      if (inspectionResult.error) throw inspectionResult.error;
      if (findingResult.error) throw findingResult.error;
      if (issueResult.error) throw issueResult.error;
      if (pilotAssetResult.error) throw pilotAssetResult.error;
      if (pilotCapabilityResult.error) throw pilotCapabilityResult.error;
      if (equipmentResult.error) throw equipmentResult.error;

      const nextAssets = (assetResult.data ?? []) as AssetRow[];
      const nextPilotAssets = (pilotAssetResult.data ?? []) as PilotAssetRow[];
      setAssets(nextAssets);
      setInspections((inspectionResult.data ?? []) as InspectionRow[]);
      setFindings((findingResult.data ?? []) as FindingRow[]);
      setIssues((issueResult.data ?? []) as IssueRow[]);
      setPilotAssets(nextPilotAssets);
      setPilotAssetCapabilities((pilotCapabilityResult.data ?? []) as PilotAssetCapabilityRow[]);
      setInspectionEquipment((equipmentResult.data ?? []) as InspectionEquipmentRow[]);
      setSelectedPilotAssetId((current) =>
        current && nextPilotAssets.some((asset) => asset.id === current)
          ? current
          : nextPilotAssets[0]?.id ?? "",
      );
      setSelectedAssetId((current) =>
        current && nextAssets.some((asset) => asset.id === current)
          ? current
          : nextAssets[0]?.id ?? null,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset intelligence could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      [asset.name, asset.asset_type, asset.external_ref, asset.location_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [assets, search]);

  const selectedInspections = useMemo(
    () => inspections.filter((inspection) => inspection.asset_id === selectedAssetId),
    [inspections, selectedAssetId],
  );
  const selectedFindings = useMemo(
    () => findings.filter((finding) => finding.asset_id === selectedAssetId),
    [findings, selectedAssetId],
  );
  const selectedIssues = useMemo(
    () => issues.filter((issue) => issue.asset_id === selectedAssetId),
    [issues, selectedAssetId],
  );
  const selectedReviewInspection = useMemo(
    () => selectedInspections.find((inspection) => inspection.id === selectedInspectionId) ?? null,
    [selectedInspections, selectedInspectionId],
  );
  const selectedIssue = useMemo(
    () => selectedIssues.find((issue) => issue.id === selectedIssueId) ?? null,
    [selectedIssues, selectedIssueId],
  );

  useEffect(() => {
    setSelectedInspectionId(null);
    setSelectedIssueId(null);
  }, [selectedAssetId]);

  const openIssues = issues.filter((issue) =>
    ["open", "monitoring", "in_progress"].includes(issue.status),
  );
  const criticalIssues = openIssues.filter((issue) =>
    ["critical", "high"].includes(issue.severity),
  );


  const selectedPilotAsset = useMemo(
    () => pilotAssets.find((asset) => asset.id === selectedPilotAssetId) ?? null,
    [pilotAssets, selectedPilotAssetId],
  );

  const selectedInspectionType = inspectionType as InspectionType;

  const selectedAircraftCapabilities = useMemo(
    () =>
      mergeInspectionCapabilities({
        identity: selectedPilotAsset
          ? {
              manufacturer: selectedPilotAsset.manufacturer,
              model: selectedPilotAsset.model,
              displayName: selectedPilotAsset.display_name,
            }
          : undefined,
        inventoryCapabilities: pilotAssetCapabilities
          .filter((item) => item.asset_id === selectedPilotAssetId)
          .map((item) => item.capability),
      }),
    [selectedPilotAsset, selectedPilotAssetId, pilotAssetCapabilities],
  );

  const selectedEquipmentReadiness = useMemo(
    () =>
      evaluateInspectionReadiness({
        inspectionType: selectedInspectionType,
        capabilities: selectedAircraftCapabilities,
      }),
    [selectedInspectionType, selectedAircraftCapabilities],
  );

  const buildPlanningContext = (inspection: InspectionRow): DominicInspectionPlanningContext | null => {
    const asset = assets.find((item) => item.id === inspection.asset_id);
    if (!asset) return null;
    const equipment = inspectionEquipment.find((item) => item.inspection_id === inspection.id) ?? null;
    const aircraft = equipment
      ? pilotAssets.find((item) => item.id === equipment.pilot_asset_id) ?? null
      : null;
    const snapshot = equipment?.capabilities_snapshot as {
      available?: string[];
      missingRequired?: string[];
      ready?: boolean;
    } | undefined;

    return {
      inspectionId: inspection.id,
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.asset_type,
      locationLabel: asset.location_label,
      latitude: asset.latitude,
      longitude: asset.longitude,
      inspectionType: inspection.inspection_type,
      objective: inspection.objective,
      sensorModes: inspection.sensor_modes,
      requiredCapabilities: inspection.required_capabilities ?? [],
      optionalCapabilities: inspection.optional_capabilities ?? [],
      equipment: aircraft && equipment
        ? {
            pilotAssetId: aircraft.id,
            manufacturer: aircraft.manufacturer,
            model: aircraft.model,
            displayName: aircraft.display_name,
            capabilities: snapshot?.available ?? [],
            ready: snapshot?.ready ?? false,
            missingRequired: snapshot?.missingRequired ?? [],
          }
        : null,
    };
  };

  const createAsset = async () => {
    if (!assetForm.name.trim() || !assetForm.assetType.trim()) {
      setMessage("Asset name and type are required.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Your DOMINIC session expired.");

      const { data, error } = await sb
        .from("dominic_assets")
        .insert({
          user_id: userId,
          name: assetForm.name.trim(),
          asset_type: assetForm.assetType.trim().toLowerCase(),
          external_ref: assetForm.externalRef.trim() || null,
          location_label: assetForm.location.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;
      setAssetForm(emptyAssetForm);
      setShowAssetForm(false);
      await refresh();
      if (data?.id) setSelectedAssetId(data.id);
      setMessage("Asset created. DOMINIC can now build inspection history around it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const createIssueReinspection = async (issue: IssueRow) => {
    if (!selectedAsset) return;
    setBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Your DOMINIC session expired.");

      const latestSensor =
        typeof issue.metadata?.latestSensorMode === "string"
          ? issue.metadata.latestSensorMode.toLowerCase()
          : typeof issue.metadata?.sensorMode === "string"
            ? issue.metadata.sensorMode.toLowerCase()
            : "rgb";
      const reinspectionType: InspectionType =
        latestSensor === "thermal"
          ? "thermal"
          : latestSensor === "gas"
            ? "ldar"
            : "visual";
      const requirements = inspectionRequirements[reinspectionType];
      const readiness = evaluateInspectionReadiness({
        inspectionType: reinspectionType,
        capabilities: selectedAircraftCapabilities,
      });
      const sensorModes =
        reinspectionType === "thermal"
          ? ["rgb", "thermal"]
          : reinspectionType === "ldar"
            ? ["rgb", "gas"]
            : ["rgb"];
      const baselineInspectionId =
        typeof issue.metadata?.latestInspectionId === "string"
          ? issue.metadata.latestInspectionId
          : typeof issue.metadata?.inspectionId === "string"
            ? issue.metadata.inspectionId
            : null;

      const capabilitySnapshot = {
        ready: readiness.ready,
        available: readiness.available,
        missingRequired: readiness.missingRequired,
        availableOptional: readiness.availableOptional,
        evidence: readiness.evidence,
        reason: "issue_reinspection",
        issueId: issue.id,
        aircraft: selectedPilotAsset
          ? {
              id: selectedPilotAsset.id,
              manufacturer: selectedPilotAsset.manufacturer,
              model: selectedPilotAsset.model,
              displayName: selectedPilotAsset.display_name,
              capabilitiesVerified: selectedPilotAsset.capabilities_verified,
            }
          : null,
      };

      const { data: inspection, error } = await sb
        .from("dominic_inspections")
        .insert({
          user_id: userId,
          asset_id: selectedAsset.id,
          baseline_inspection_id: baselineInspectionId,
          inspection_type: reinspectionType,
          objective: `Reinspect tracked issue: ${issue.title}`,
          status: "planned",
          capture_source: "manual",
          sensor_modes: sensorModes,
          required_capabilities: requirements.required,
          optional_capabilities: requirements.optional,
          capability_snapshot: capabilitySnapshot,
          ai_summary: {
            issueId: issue.id,
            purpose: "issue_reinspection",
            previousSeverity: issue.severity,
            previousLastSeenAt: issue.last_seen_at,
          },
        })
        .select("id,inspection_type,objective,sensor_modes,required_capabilities,optional_capabilities")
        .single();
      if (error || !inspection) throw error ?? new Error("Reinspection could not be created.");

      if (selectedPilotAsset) {
        const { error: equipmentError } = await sb
          .from("dominic_inspection_equipment")
          .insert({
            user_id: userId,
            inspection_id: inspection.id,
            pilot_asset_id: selectedPilotAsset.id,
            role: "aircraft",
            capabilities_snapshot: capabilitySnapshot,
          });
        if (equipmentError) throw equipmentError;
      }

      setSelectedInspectionId(inspection.id);
      await refresh();

      if (onPlanInspection) {
        onPlanInspection({
          inspectionId: inspection.id,
          assetId: selectedAsset.id,
          assetName: selectedAsset.name,
          assetType: selectedAsset.asset_type,
          locationLabel: selectedAsset.location_label,
          latitude: selectedAsset.latitude,
          longitude: selectedAsset.longitude,
          inspectionType: inspection.inspection_type,
          objective: inspection.objective,
          sensorModes: inspection.sensor_modes,
          requiredCapabilities: inspection.required_capabilities,
          optionalCapabilities: inspection.optional_capabilities,
          equipment: selectedPilotAsset
            ? {
                pilotAssetId: selectedPilotAsset.id,
                manufacturer: selectedPilotAsset.manufacturer,
                model: selectedPilotAsset.model,
                displayName: selectedPilotAsset.display_name,
                capabilities: readiness.available,
                ready: readiness.ready,
                missingRequired: readiness.missingRequired,
              }
            : null,
        });
      }

      setMessage(
        readiness.ready
          ? "Reinspection created from the tracked issue and opened in Capture Planner."
          : selectedPilotAsset
            ? `Reinspection created, but the selected aircraft is missing: ${readiness.missingRequired.map(inspectionCapabilityLabel).join(", ")}.`
            : "Reinspection created. Assign compatible equipment before execution.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reinspection could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const startInspection = async () => {
    if (!selectedAsset) return;
    setBusy(true);
    setMessage(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Your DOMINIC session expired.");

      const requirements = inspectionRequirements[selectedInspectionType];
      const sensorModes =
        inspectionType === "thermal"
          ? ["rgb", "thermal"]
          : inspectionType === "ldar"
            ? ["rgb", "gas"]
            : ["rgb"];

      const capabilitySnapshot = {
        ready: selectedEquipmentReadiness.ready,
        available: selectedEquipmentReadiness.available,
        missingRequired: selectedEquipmentReadiness.missingRequired,
        availableOptional: selectedEquipmentReadiness.availableOptional,
        evidence: selectedEquipmentReadiness.evidence,
        aircraft: selectedPilotAsset
          ? {
              id: selectedPilotAsset.id,
              manufacturer: selectedPilotAsset.manufacturer,
              model: selectedPilotAsset.model,
              displayName: selectedPilotAsset.display_name,
              capabilitiesVerified: selectedPilotAsset.capabilities_verified,
            }
          : null,
      };

      const { data: inspection, error } = await sb
        .from("dominic_inspections")
        .insert({
          user_id: userId,
          asset_id: selectedAsset.id,
          inspection_type: inspectionType,
          objective: inspectionObjective.trim() || null,
          status: "planned",
          capture_source: "manual",
          sensor_modes: sensorModes,
          required_capabilities: requirements.required,
          optional_capabilities: requirements.optional,
          capability_snapshot: capabilitySnapshot,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (selectedPilotAsset && inspection?.id) {
        const { error: equipmentError } = await sb.from("dominic_inspection_equipment").insert({
          user_id: userId,
          inspection_id: inspection.id,
          pilot_asset_id: selectedPilotAsset.id,
          role: "aircraft",
          capabilities_snapshot: capabilitySnapshot,
        });
        if (equipmentError) throw equipmentError;
      }

      setInspectionObjective("");
      setSelectedInspectionId(inspection?.id ?? null);
      await refresh();
      setMessage(
        selectedEquipmentReadiness.ready
          ? "Inspection created with compatible equipment. Open Plan Capture to build the flight."
          : selectedPilotAsset
            ? `Inspection created, but selected equipment is missing: ${selectedEquipmentReadiness.missingRequired.map(inspectionCapabilityLabel).join(", ")}. DOMINIC will allow planning but will not mark this aircraft ready for execution.`
            : "Inspection created without assigned aircraft. Select compatible equipment before execution.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: 680, background: BG, color: TEXT, padding: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ color: ORANGE, fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>
            Asset Intelligence
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 900 }}>
            What changed, what is wrong, and what needs attention.
          </h1>
          <div style={{ color: MUTED, fontSize: 11, marginTop: 5 }}>
            Persistent assets, inspection history, findings and tracked issues — not isolated mapping projects.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            border: `1px solid ${LINE}`,
            background: PANEL,
            color: TEXT,
            borderRadius: 9,
            padding: "9px 11px",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            cursor: loading ? "wait" : "pointer",
            fontWeight: 800,
          }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Assets", value: assets.length, icon: Factory, color: ORANGE },
          { label: "Open issues", value: openIssues.length, icon: AlertTriangle, color: AMBER },
          { label: "High / critical", value: criticalIssues.length, icon: ShieldAlert, color: RED },
          { label: "Inspections", value: inspections.length, icon: ClipboardCheck, color: GREEN },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ color: MUTED, fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{value}</div>
              </div>
              <Icon size={19} color={color} />
            </div>
          </Card>
        ))}
      </div>

      {message ? (
        <div style={{ marginBottom: 10, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 11px", background: PANEL_2, color: MUTED, fontSize: 10 }}>
          {message}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1.15fr) minmax(320px,.85fr)", gap: 10 }}>
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: 11, borderBottom: `1px solid ${LINE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Assets</strong>
              <button
                type="button"
                onClick={() => setShowAssetForm((value) => !value)}
                style={{ border: 0, borderRadius: 7, background: ORANGE, color: "#160901", padding: "6px 8px", cursor: "pointer", fontWeight: 900 }}
              >
                <Plus size={13} />
              </button>
            </div>
            <div style={{ position: "relative", marginTop: 9 }}>
              <Search size={14} color={MUTED} style={{ position: "absolute", left: 9, top: 9 }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assets"
                style={{ width: "100%", boxSizing: "border-box", background: BG, border: `1px solid ${LINE}`, borderRadius: 8, color: TEXT, padding: "8px 8px 8px 30px", outline: "none" }}
              />
            </div>
          </div>

          {showAssetForm ? (
            <div style={{ padding: 10, borderBottom: `1px solid ${LINE}`, background: "#0D141B", display: "grid", gap: 7 }}>
              <input value={assetForm.name} onChange={(e) => setAssetForm((v) => ({ ...v, name: e.target.value }))} placeholder="Asset name — Tank 17" style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }} />
              <select value={assetForm.assetType} onChange={(e) => setAssetForm((v) => ({ ...v, assetType: e.target.value }))} style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }}>
                <option value="equipment">Equipment</option>
                <option value="tank">Tank</option>
                <option value="roof">Roof</option>
                <option value="building">Building</option>
                <option value="pipeline">Pipeline</option>
                <option value="solar_array">Solar Array</option>
                <option value="stockpile">Stockpile</option>
                <option value="structure">Structure</option>
                <option value="site">Site / Area</option>
              </select>
              <input value={assetForm.externalRef} onChange={(e) => setAssetForm((v) => ({ ...v, externalRef: e.target.value }))} placeholder="Asset ID / tag (optional)" style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }} />
              <input value={assetForm.location} onChange={(e) => setAssetForm((v) => ({ ...v, location: e.target.value }))} placeholder="Location (optional)" style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }} />
              <button type="button" onClick={() => void createAsset()} disabled={busy} style={{ border: 0, borderRadius: 7, background: ORANGE, color: "#160901", padding: 8, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}>
                Create Asset
              </button>
            </div>
          ) : null}

          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 18, color: MUTED, fontSize: 10 }}>Loading assets…</div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ padding: 18, color: MUTED, fontSize: 10, lineHeight: 1.5 }}>
                No assets yet. Create the first real-world asset DOMINIC should remember over time.
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const active = selectedAssetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                    style={{
                      width: "100%",
                      border: 0,
                      borderBottom: `1px solid ${LINE}`,
                      background: active ? "rgba(244,90,30,.10)" : "transparent",
                      color: TEXT,
                      textAlign: "left",
                      padding: "10px 11px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 11 }}>{asset.name}</strong>
                      <span style={{ color: conditionColor(asset.condition_state), fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>{asset.condition_state}</span>
                    </div>
                    <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
                      {asset.asset_type.replaceAll("_", " ")}
                      {asset.external_ref ? ` · ${asset.external_ref}` : ""}
                    </div>
                    {asset.location_label ? <div style={{ color: "#B5C0C9", fontSize: 8, marginTop: 2 }}>{asset.location_label}</div> : null}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {selectedAsset ? (
            <>
              <Card style={{ padding: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: ORANGE, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".09em" }}>{selectedAsset.asset_type.replaceAll("_", " ")}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>{selectedAsset.name}</div>
                    <div style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>
                      {selectedAsset.external_ref ?? "No external asset tag"}
                      {selectedAsset.location_label ? ` · ${selectedAsset.location_label}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: conditionColor(selectedAsset.condition_state), fontWeight: 900, fontSize: 12, textTransform: "uppercase" }}>{selectedAsset.condition_state}</div>
                    <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
                      {selectedAsset.condition_score === null ? "No condition score yet" : `Health ${selectedAsset.condition_score.toFixed(0)} / 100`}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, marginTop: 12 }}>
                  {[
                    ["Last inspected", formatWhen(selectedAsset.last_inspected_at)],
                    ["Open issues", String(selectedIssues.filter((issue) => ["open","monitoring","in_progress"].includes(issue.status)).length)],
                    ["Findings", String(selectedFindings.length)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL_2, padding: 9 }}>
                      <div style={{ color: MUTED, fontSize: 8 }}>{label}</div>
                      <div style={{ fontSize: 11, fontWeight: 900, marginTop: 3 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card style={{ padding: 13 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Crosshair size={16} color={ORANGE} />
                  <strong style={{ fontSize: 13 }}>Start an inspection</strong>
                </div>
                <div style={{ color: MUTED, fontSize: 9, lineHeight: 1.5, marginTop: 4 }}>
                  This creates the durable inspection record that future flight capture and AI findings attach to.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr) auto", gap: 7, marginTop: 9 }}>
                  <select value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }}>
                    <option value="visual">Visual</option>
                    <option value="thermal">Thermal</option>
                    <option value="ldar">LDAR</option>
                    <option value="roof">Roof</option>
                    <option value="construction">Construction</option>
                    <option value="stockpile">Stockpile</option>
                    <option value="security">Security</option>
                  </select>
                  <input value={inspectionObjective} onChange={(e) => setInspectionObjective(e.target.value)} placeholder="Objective — find thermal anomalies, corrosion, leak evidence…" style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }} />
                  <button type="button" onClick={() => void startInspection()} disabled={busy} style={{ border: 0, borderRadius: 7, background: ORANGE, color: "#160901", padding: "8px 11px", fontWeight: 900, cursor: busy ? "wait" : "pointer" }}>
                    Create
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,.8fr) minmax(0,1.2fr)", gap: 7, marginTop: 8 }}>
                  <select
                    aria-label="Inspection aircraft"
                    value={selectedPilotAssetId}
                    onChange={(event) => setSelectedPilotAssetId(event.target.value)}
                    style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 7, padding: 8 }}
                  >
                    <option value="">No aircraft selected</option>
                    {pilotAssets.map((aircraft) => (
                      <option key={aircraft.id} value={aircraft.id}>
                        {[aircraft.manufacturer, aircraft.model, aircraft.display_name].filter(Boolean).join(" · ") || "Unnamed aircraft"}
                      </option>
                    ))}
                  </select>
                  <div style={{ border: `1px solid ${selectedEquipmentReadiness.ready ? "rgba(112,214,160,.35)" : "rgba(255,181,101,.35)"}`, borderRadius: 7, background: selectedEquipmentReadiness.ready ? "rgba(112,214,160,.07)" : "rgba(255,181,101,.07)", padding: "7px 9px" }}>
                    <div style={{ color: selectedEquipmentReadiness.ready ? GREEN : AMBER, fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>
                      {selectedPilotAsset ? (selectedEquipmentReadiness.ready ? "Equipment ready" : "Capability gap") : "Aircraft not assigned"}
                    </div>
                    <div style={{ color: MUTED, fontSize: 8, lineHeight: 1.4, marginTop: 3 }}>
                      {selectedPilotAsset
                        ? selectedEquipmentReadiness.ready
                          ? `Required: ${selectedEquipmentReadiness.required.map(inspectionCapabilityLabel).join(", ")}.`
                          : `Missing: ${selectedEquipmentReadiness.missingRequired.map(inspectionCapabilityLabel).join(", ")}. You can still create the inspection plan, but this aircraft will not be marked execution-ready.`
                        : "DOMINIC plans by capability. Select the aircraft you intend to validate for this inspection."}
                    </div>
                  </div>
                </div>
              </Card>

              <Card style={{ overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>Inspection history</strong>
                  <span style={{ color: MUTED, fontSize: 9 }}>{selectedInspections.length} total</span>
                </div>
                {selectedInspections.length === 0 ? (
                  <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>No inspections recorded yet.</div>
                ) : (
                  selectedInspections.slice(0, 8).map((inspection) => (
                    <div key={inspection.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}`, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 900, textTransform: "capitalize" }}>{inspection.inspection_type.replaceAll("_", " ")}</div>
                        <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>{inspection.objective ?? "No objective recorded"}</div>
                        <div style={{ color: "#B9C3CC", fontSize: 8, marginTop: 3 }}>{formatWhen(inspection.created_at)} · {inspection.sensor_modes.join(" + ") || "sensor not set"}</div>
                      </div>
                      <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                        <div style={{ color: inspection.status === "complete" ? GREEN : AMBER, fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>{inspection.status}</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {onPlanInspection && inspection.status !== "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => {
                                const context = buildPlanningContext(inspection);
                                if (context) onPlanInspection(context);
                              }}
                              style={{ border: `1px solid rgba(244,90,30,.4)`, background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                            >
                              Plan Capture
                            </button>
                          ) : null}
                          {inspection.status !== "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => setSelectedInspectionId(inspection.id)}
                              style={{ border: `1px solid ${selectedInspectionId === inspection.id ? "rgba(112,214,160,.45)" : LINE}`, background: selectedInspectionId === inspection.id ? "rgba(112,214,160,.09)" : PANEL_2, color: selectedInspectionId === inspection.id ? GREEN : TEXT, borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                            >
                              Review Evidence
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </Card>

              {selectedReviewInspection ? (
                <DominicInspectionEvidenceReview
                  inspection={selectedReviewInspection}
                  asset={{
                    id: selectedAsset.id,
                    name: selectedAsset.name,
                    asset_type: selectedAsset.asset_type,
                  }}
                  onChanged={() => refresh()}
                />
              ) : null}
            </>
          ) : (
            <Card style={{ padding: 24, minHeight: 260, display: "grid", placeItems: "center", textAlign: "center" }}>
              <div>
                <Factory size={28} color={ORANGE} />
                <div style={{ fontSize: 16, fontWeight: 900, marginTop: 8 }}>Create an asset first</div>
                <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>DOMINIC needs a persistent real-world object before it can remember inspection history.</div>
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 7 }}>
              <AlertTriangle size={15} color={AMBER} />
              <strong style={{ fontSize: 13 }}>Open issues</strong>
            </div>
            {!selectedAsset ? (
              <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>Select an asset.</div>
            ) : selectedIssues.filter((issue) => ["open","monitoring","in_progress"].includes(issue.status)).length === 0 ? (
              <div style={{ padding: 14, color: MUTED, fontSize: 9, display: "flex", gap: 7, alignItems: "center" }}><CheckCircle2 size={14} color={GREEN} /> No open issues recorded.</div>
            ) : (
              selectedIssues
                .filter((issue) => ["open","monitoring","in_progress"].includes(issue.status))
                .slice(0, 8)
                .map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => setSelectedIssueId((current) => current === issue.id ? null : issue.id)}
                    style={{
                      width: "100%",
                      border: 0,
                      borderBottom: `1px solid ${LINE}`,
                      background: selectedIssueId === issue.id ? "rgba(244,90,30,.08)" : "transparent",
                      color: TEXT,
                      textAlign: "left",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 10 }}>{issue.title}</strong>
                      <span style={{ color: severityColor(issue.severity), fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>{issue.severity}</span>
                    </div>
                    <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
                      {issue.issue_type.replaceAll("_", " ")} · {issue.status.replaceAll("_", " ")}
                    </div>
                    <div style={{ color: "#B9C3CC", fontSize: 8, marginTop: 3 }}>
                      First seen {formatWhen(issue.first_seen_at)} · Last seen {formatWhen(issue.last_seen_at)}
                      {typeof issue.metadata?.recurrenceCount === "number" && issue.metadata.recurrenceCount > 0
                        ? ` · observed again ${issue.metadata.recurrenceCount}×`
                        : ""}
                    </div>
                    {issue.recommended_action ? <div style={{ color: "#CBD3DA", fontSize: 8, marginTop: 5 }}><Wrench size={11} style={{ display: "inline", marginRight: 4 }} />{issue.recommended_action}</div> : null}
                    <div style={{ color: selectedIssueId === issue.id ? ORANGE : MUTED, fontSize: 7, fontWeight: 900, marginTop: 6, textTransform: "uppercase" }}>
                      {selectedIssueId === issue.id ? "Hide history" : "View issue history"}
                    </div>
                  </button>
                ))
            )}
          </Card>

          {selectedIssue ? (
            <DominicIssueIntelligence
              issue={selectedIssue}
              busy={busy}
              onReinspect={(issue) => void createIssueReinspection(issue)}
            />
          ) : null}

          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 7 }}>
              <ThermometerSun size={15} color={ORANGE} />
              <strong style={{ fontSize: 13 }}>Recent findings</strong>
            </div>
            {!selectedAsset ? (
              <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>Select an asset.</div>
            ) : selectedFindings.length === 0 ? (
              <div style={{ padding: 14, color: MUTED, fontSize: 9 }}>No AI or operator findings recorded yet.</div>
            ) : (
              selectedFindings.slice(0, 10).map((finding) => (
                <div key={finding.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: 10 }}>{finding.title}</strong>
                    <span style={{ color: severityColor(finding.severity), fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>{finding.severity}</span>
                  </div>
                  <div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>
                    {finding.finding_type.replaceAll("_", " ")}
                    {finding.sensor_mode ? ` · ${finding.sensor_mode}` : ""}
                    {finding.confidence !== null ? ` · ${Math.round(finding.confidence * 100)}% confidence` : ""}
                  </div>
                  <div style={{ color: finding.review_status === "confirmed" ? GREEN : AMBER, fontSize: 8, marginTop: 4, textTransform: "uppercase", fontWeight: 900 }}>{finding.review_status.replaceAll("_", " ")}</div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
