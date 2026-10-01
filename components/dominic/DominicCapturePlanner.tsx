"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Crosshair,
  Download,
  FolderOpen,
  Gauge,
  Home,
  LocateFixed,
  MapPinned,
  Navigation,
  Play,
  Plus,
  Trash2,
  Radio,
  RotateCcw,
  Save,
  Square,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  bearingAndDistanceBetween,
  buildAutonomousCheckpoints,
  buildCaptureSequence,
  buildGeographicCheckpoints,
  calculateObjectScanPlan,
  deriveRelativeCaptureTelemetry,
  evaluateCaptureGuidance,
  missionProfiles,
  validateMissionCalibration,
  type AircraftTelemetry,
  type CaptureMissionType,
  type NoFlySector,
} from "@/lib/capturePlanner";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { buildDominicDjiMissionPackage, downloadDominicDjiMissionPackage } from "@/lib/aircraft/djiMissionPackage";
import type { DominicInspectionPlanningContext } from "@/lib/dominicInspection";
import {
  decideRealtimeInspectionScreening,
  realtimeScreeningReasonLabel,
} from "@/lib/dominicRealtimeScreening";
import { buildDominicInspectionCameraPreset } from "@/lib/dominicCameraPreset";
import { decideInspectionQualityRecapture } from "@/lib/dominicInspectionRecapture";
import {
  DEFAULT_INSPECTION_WATCH_INTERVAL_SEC,
  inspectionWatchReadiness,
  inspectionWatchReasonLabel,
  normalizeInspectionWatchInterval,
} from "@/lib/dominicInspectionWatch";
import CapturePlanningMap from "@/components/dominic/CapturePlanningMap";
import { resolveCaptureCameraProfile } from "@/lib/captureCameraProfiles";
import {
  deriveFieldOfView,
  type CameraPayloadProfile,
} from "@/lib/aircraft/payload";
import {
  SafetyScenarioAircraftAdapter,
  safetyScenarioLabels,
  type SafetyScenario,
} from "@/lib/aircraft/safetyScenarioAdapter";
import { WebSocketFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { connectFlightBridgeAdapter } from "@/lib/aircraft/bridgeConnect";
import type {
  DominicAircraftAdapter,
  AircraftCapabilities,
  UniversalMediaCapture,
} from "@/lib/aircraft/contract";
import { analyzeImageFile, type ImageQualityAssessment } from "@/lib/imageQuality";
import { matchRangefinderTargetToCapture } from "@/lib/aircraft/rangefinderTarget";
import {
  runBenchReadiness,
  type BenchReadinessReport,
} from "@/lib/aircraft/benchReadiness";
import {
  aircraftFingerprint,
  attestControlledFieldValidation,
  updateBenchVerification,
  updateSimulationVerification,
  validationStatus,
  type FlightValidationRecord,
} from "@/lib/aircraft/flightValidation";
import {
  assessCoverage,
  buildRepairPlan,
  summarizeCoverageByRing,
  type CaptureObservation,
} from "@/lib/captureCoverage";
import {
  calculateBuildingPlan,
  calculateCorridorPlan,
  calculateFacadePlan,
  calculateInteriorPlan,
  calculateRoofPlan,
  calculateStockpilePlan,
  georeferencePattern,
  validatePatternCalibration,
} from "@/lib/capturePatterns";
import {
  DominicMissionEngine,
  type MissionExecutionSnapshot,
} from "@/lib/aircraft/missionEngine";

type PersistedCapturePlanState = {
  objectDiameterFt: number;
  objectHeightFt: number;
  standoffFt: number;
  overlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg?: number;
  centerLatitude: number;
  centerLongitude: number;
  baseRelativeAltitudeFt: number;
  homeLatitude: number;
  homeLongitude: number;
  minRelativeAltitudeFt: number;
  maxRelativeAltitudeFt: number;
  minStandoffFt: number;
  maxStandoffFt: number;
  noFlySectors: NoFlySector[];
  patternLengthFt: number;
  patternWidthFt: number;
  patternHeightFt: number;
  patternAltitudeFt: number;
  patternStandoffFt: number;
  patternOverlapPct: number;
  patternHeadingDeg: number;
  waypointOverrides?: Record<string, { latitude: number; longitude: number }>;
  mapAreaPoints?: Array<{ xPct: number; yPct: number; latitude: number; longitude: number }>;
  mapLocationLabel?: string | null;
  planningSource?: "map" | "live" | "local";
  inspectionId?: string;
  assetId?: string;
  assetName?: string;
  inspectionType?: string;
};

type PlannerAircraft = {
  id: string;
  manufacturer: string | null;
  model: string | null;
  display_name: string | null;
};

type SavedCapturePlan = {
  id: string;
  name: string;
  mission_type: CaptureMissionType;
  schema_version: number;
  plan_state: PersistedCapturePlanState;
  updated_at: string;
};

type LiveInspectionFinding = {
  id: string;
  finding_type: string;
  title: string;
  description?: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode?: string | null;
  observed_at?: string;
};

type RecentFlightRun = {
  id: string;
  mission_type: CaptureMissionType;
  status: string;
  aircraft_vendor?: string | null;
  aircraft_model?: string | null;
  aircraft_id?: string | null;
  payload_snapshot?: { id?: string; name?: string; kind?: string } | null;
  coverage_summary?: { coveragePct?: number } | null;
  started_at?: string | null;
  completed_at?: string | null;
  aborted_at?: string | null;
  failure_message?: string | null;
  created_at: string;
};

const V = {
  bg: "#0B1117",
  panel: "#10161D",
  panel2: "#151D25",
  line: "#25303B",
  text: "#F5F7FA",
  muted: "#8F9CAA",
  orange: "#F45A1E",
  orangeDark: "#D9480F",
  green: "#70D6A0",
  amber: "#FFB86B",
};

const safetyItems = [
  "Subject perimeter is clear of people and moving vehicles.",
  "Minimum stand-off can be maintained around the full orbit.",
  "No wires, branches, poles or overhangs intrude into the planned rings.",
  "Pilot has a safe takeoff/landing point and uninterrupted control link.",
];

const manualGuidance: Record<Exclude<CaptureMissionType, "object">, string[]> = {
  roof: [
    "Start with a nadir perimeter check, then fly parallel roof lanes.",
    "Hold consistent height and speed; use 75–80% forward overlap.",
    "Add an oblique perimeter pass for edges, fascia, penetrations and parapets.",
  ],
  building: [
    "Fly stacked horizontal orbits from lower facade to roofline.",
    "Keep the camera aimed toward the building center with consistent stand-off.",
    "Add corner-transition frames and roof obliques to connect all faces.",
  ],
  facade: [
    "Fly parallel horizontal passes across the facade.",
    "Use enough vertical spacing to preserve at least 70% image overlap.",
    "Capture corners obliquely so adjoining faces reconstruct together.",
  ],
  interior: [
    "Use slow loops around each room with stable exposure and focus.",
    "Add doorway transition frames before entering the next space.",
    "Capture corners, ceiling transitions and texture-poor surfaces from extra angles.",
  ],
  stockpile: [
    "Fly a nadir grid over the full pile and toe boundary.",
    "Add a perimeter oblique pass aimed at the pile center.",
    "Maintain consistent ground sampling distance and avoid changing zoom mid-set.",
  ],
  corridor: [
    "Fly a straight outbound lane with repeatable camera geometry.",
    "Return on a parallel lane with strong side overlap.",
    "Add cross-corridor tie frames at turns, endpoints and major feature changes.",
  ],
};

function Field({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ color: V.muted, fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${V.line}`, background: "#0D1319", borderRadius: 8, padding: "6px 8px" }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ width: "100%", border: 0, outline: 0, background: "transparent", color: V.text, fontSize: 13, fontWeight: 700 }}
        />
        {suffix ? <span style={{ color: V.muted, fontSize: 10 }}>{suffix}</span> : null}
      </div>
    </label>
  );
}


function polarPoint(bearingDeg: number, radius: number) {
  const radians = ((bearingDeg - 90) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius,
  };
}

function sectorPath(startBearingDeg: number, endBearingDeg: number, radius = 46) {
  const start = ((startBearingDeg % 360) + 360) % 360;
  const end = ((endBearingDeg % 360) + 360) % 360;
  const delta = (end - start + 360) % 360;
  if (delta === 0) return "";
  const startPoint = polarPoint(start, radius);
  const endPoint = polarPoint(end, radius);
  const largeArc = delta > 180 ? 1 : 0;
  return `M 50 50 L ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)} Z`;
}

export default function DominicCapturePlanner({
  inspectionContext = null,
}: {
  inspectionContext?: DominicInspectionPlanningContext | null;
}) {
  const [missionType, setMissionType] = useState<CaptureMissionType>("roof");
  const [planningSource, setPlanningSource] = useState<"map" | "live" | "local">("map");
  const [showAdvancedPlanner, setShowAdvancedPlanner] = useState(false);
  const [plannerView, setPlannerView] = useState<"plan" | "review">("plan");
  const [reviewPreflightRan, setReviewPreflightRan] = useState(false);
  const [reviewFlightConfirmed, setReviewFlightConfirmed] = useState(false);
  const [mapDrawing, setMapDrawing] = useState(false);
  const [mapAreaPoints, setMapAreaPoints] = useState<Array<{ xPct: number; yPct: number; latitude: number; longitude: number }>>([]);
  const [mapAreaDefined, setMapAreaDefined] = useState(false);
  const [waypointOverrides, setWaypointOverrides] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [mapAreaMessage, setMapAreaMessage] = useState("Search for the site, choose a mission type, then define the mapping area.");
  const [mapSearch, setMapSearch] = useState("");
  const [mapSearchBusy, setMapSearchBusy] = useState(false);
  const [mapSearchResults, setMapSearchResults] = useState<Array<{ latitude: number; longitude: number; label: string }>>([]);
  const [mapLocationLabel, setMapLocationLabel] = useState<string | null>(null);
  const [mapFocusRevision, setMapFocusRevision] = useState(0);
  const [objectDiameterFt, setObjectDiameterFt] = useState(12);
  const [objectHeightFt, setObjectHeightFt] = useState(10);
  const [standoffFt, setStandoffFt] = useState(18);
  const [overlapPct, setOverlapPct] = useState(75);
  const [horizontalFovDeg, setHorizontalFovDeg] = useState(84);
  const [verticalFovDeg, setVerticalFovDeg] = useState(68.1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [captured, setCaptured] = useState<Record<string, boolean>>({});
  const [captureObservations, setCaptureObservations] = useState<CaptureObservation[]>([]);
  const [safety, setSafety] = useState<Record<number, boolean>>({});
  const [telemetryBearingDeg, setTelemetryBearingDeg] = useState(0);
  const [telemetryDistanceFt, setTelemetryDistanceFt] = useState(24);
  const [telemetryCameraAngle, setTelemetryCameraAngle] = useState(5);
  const [guidanceLock, setGuidanceLock] = useState(false);
  const [centerLatitude, setCenterLatitude] = useState(39.95);
  const [centerLongitude, setCenterLongitude] = useState(-75.16);
  const [baseRelativeAltitudeFt, setBaseRelativeAltitudeFt] = useState(0);
  const [homeLatitude, setHomeLatitude] = useState(39.9501);
  const [homeLongitude, setHomeLongitude] = useState(-75.1601);
  const [minRelativeAltitudeFt, setMinRelativeAltitudeFt] = useState(0);
  const [maxRelativeAltitudeFt, setMaxRelativeAltitudeFt] = useState(120);
  const [minStandoffFt, setMinStandoffFt] = useState(10);
  const [maxStandoffFt, setMaxStandoffFt] = useState(80);
  const [noFlySectors, setNoFlySectors] = useState<NoFlySector[]>([]);
  const [missionArmed, setMissionArmed] = useState(false);
  const [telemetryMode, setTelemetryMode] = useState<"simulator" | "aircraft">("simulator");
  const [aircraftTelemetry, setAircraftTelemetry] = useState<AircraftTelemetry | null>(null);
  const [patternLengthFt, setPatternLengthFt] = useState(100);
  const [patternWidthFt, setPatternWidthFt] = useState(60);
  const [patternHeightFt, setPatternHeightFt] = useState(40);
  const [patternAltitudeFt, setPatternAltitudeFt] = useState(75);
  const [patternStandoffFt, setPatternStandoffFt] = useState(30);
  const [patternOverlapPct, setPatternOverlapPct] = useState(75);
  const [patternHeadingDeg, setPatternHeadingDeg] = useState(0);
  const [secondaryIndex, setSecondaryIndex] = useState(0);
  const [secondaryObservations, setSecondaryObservations] = useState<CaptureObservation[]>([]);
  const [secondaryImageStatus, setSecondaryImageStatus] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [secondaryImageMessage, setSecondaryImageMessage] = useState<string | null>(null);
  const [secondaryFlightApprovalSignature, setSecondaryFlightApprovalSignature] = useState<string | null>(null);
  const [autonomousSnapshot, setAutonomousSnapshot] = useState<MissionExecutionSnapshot | null>(null);
  const [autonomousRunning, setAutonomousRunning] = useState(false);
  const [autonomousMode, setAutonomousMode] = useState<"full" | "repair">("full");
  const [autonomousTarget, setAutonomousTarget] = useState<"simulator" | "connected">("simulator");
  const [lastFlightRunId, setLastFlightRunId] = useState<string | null>(null);
  const [flightAuditStatus, setFlightAuditStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [recentFlightRuns, setRecentFlightRuns] = useState<RecentFlightRun[]>([]);
  const [flightHistoryLoading, setFlightHistoryLoading] = useState(false);
  const [realFlightApprovalSignature, setRealFlightApprovalSignature] = useState<string | null>(null);
  const [bridgeUrl, setBridgeUrl] = useState("ws://127.0.0.1:8787");
  const [bridgeStatus, setBridgeStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [imageAnalysisStatus, setImageAnalysisStatus] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [imageAnalysisMessage, setImageAnalysisMessage] = useState<string | null>(null);
  const [lastImageQuality, setLastImageQuality] = useState<ImageQualityAssessment | null>(null);
  const [bridgeInfo, setBridgeInfo] = useState<{
    bridgeId: string;
    vendor: string;
    model?: string;
    aircraftId: string;
    capabilities: AircraftCapabilities;
    payloads: CameraPayloadProfile[];
    activePayloadId?: string;
  } | null>(null);
  const bridgeAdapterRef = useRef<DominicAircraftAdapter | null>(null);
  const qualityRecaptureAttemptsRef = useRef<Record<string, number>>({});
  const autonomousEngineRef = useRef<DominicMissionEngine | null>(null);
  const [missionControlMessage, setMissionControlMessage] = useState<string | null>(null);
  const bridgeUnsubscribeRef = useRef<(() => void) | null>(null);
  const bridgeMediaUnsubscribeRef = useRef<(() => void) | null>(null);
  const realtimeScreeningQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [automaticMediaCount, setAutomaticMediaCount] = useState(0);
  const [automaticScreeningCount, setAutomaticScreeningCount] = useState(0);
  const [automaticMediaStatus, setAutomaticMediaStatus] = useState<string | null>(null);
  const [inspectionWatchEnabled, setInspectionWatchEnabled] = useState(false);
  const [inspectionWatchIntervalSec, setInspectionWatchIntervalSec] = useState(DEFAULT_INSPECTION_WATCH_INTERVAL_SEC);
  const [inspectionWatchCaptureCount, setInspectionWatchCaptureCount] = useState(0);
  const inspectionWatchCapturePendingRef = useRef(false);
  const inspectionWatchLastRequestedAtRef = useRef(0);
  const [liveInspectionFindings, setLiveInspectionFindings] = useState<LiveInspectionFinding[]>([]);
  const [liveFindingReviewBusyId, setLiveFindingReviewBusyId] = useState<string | null>(null);
  const [followUpFindingId, setFollowUpFindingId] = useState<string | null>(null);
  const [benchReport, setBenchReport] = useState<BenchReadinessReport | null>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchRequireRtk, setBenchRequireRtk] = useState(false);
  const [flightValidation, setFlightValidation] = useState<FlightValidationRecord | null>(null);
  const [controlledFieldNotes, setControlledFieldNotes] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [safetyScenario, setSafetyScenario] = useState<SafetyScenario>("battery_rth_on_first_transit");
  const [safetyScenarioResult, setSafetyScenarioResult] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedCapturePlan[]>([]);
  const [activeSavedPlanId, setActiveSavedPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("Untitled Capture Plan");
  const [planPersistenceStatus, setPlanPersistenceStatus] = useState<string | null>(null);
  const [planPersistenceBusy, setPlanPersistenceBusy] = useState(false);
  const [pilotAircraft, setPilotAircraft] = useState<PlannerAircraft[]>([]);
  const [selectedAircraftId, setSelectedAircraftId] = useState("");
  const [cameraProfileMessage, setCameraProfileMessage] = useState<string | null>(null);

  const activeConnectedPayload = useMemo(() => {
    if (!bridgeInfo?.payloads.length) return null;
    return (
      bridgeInfo.payloads.find((payload) => payload.id === bridgeInfo.activePayloadId) ??
      bridgeInfo.payloads[0]
    );
  }, [bridgeInfo]);

  const inspectionEquipmentReady =
    !inspectionContext || inspectionContext.equipment?.ready === true;

  useEffect(() => {
    qualityRecaptureAttemptsRef.current = {};
    inspectionWatchCapturePendingRef.current = false;
    inspectionWatchLastRequestedAtRef.current = 0;
    setInspectionWatchEnabled(false);
    setInspectionWatchCaptureCount(0);
  }, [inspectionContext?.inspectionId, inspectionContext?.followUpCapture?.findingId]);

  useEffect(() => {
    if (bridgeStatus !== "connected" || !activeConnectedPayload) return;
    const fov = deriveFieldOfView(activeConnectedPayload);
    if (fov.horizontalFovDeg === null || fov.verticalFovDeg === null) {
      setCameraProfileMessage(
        `Connected payload ${activeConnectedPayload.name} does not expose complete camera geometry. Enter FOV manually.`,
      );
      return;
    }
    setSelectedAircraftId("");
    setHorizontalFovDeg(Number(fov.horizontalFovDeg.toFixed(2)));
    setVerticalFovDeg(Number(fov.verticalFovDeg.toFixed(2)));
    setCameraProfileMessage(
      `Connected payload ${activeConnectedPayload.name}: ${fov.horizontalFovDeg.toFixed(1)}° horizontal · ${fov.verticalFovDeg.toFixed(1)}° vertical FOV applied automatically.`,
    );
  }, [bridgeStatus, activeConnectedPayload]);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb
        .from("pilot_assets")
        .select("id,manufacturer,model,display_name")
        .eq("asset_type", "uav")
        .eq("status", "active")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (active) setPilotAircraft((data ?? []) as PlannerAircraft[]);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setLiveInspectionFindings([]);
    setFollowUpFindingId(null);
    setAutomaticScreeningCount(0);
    if (!inspectionContext) return;

    setPlanName(
      `${inspectionContext.assetName} · ${inspectionContext.inspectionType.replaceAll("_", " ")} inspection`,
    );
    setPlannerView("plan");
    setReviewPreflightRan(false);
    setReviewFlightConfirmed(false);
    setPlanPersistenceStatus(
      inspectionContext.equipment?.ready
        ? `Inspection linked to ${inspectionContext.assetName}. Selected aircraft satisfies the required capabilities.`
        : inspectionContext.equipment
          ? `Inspection linked to ${inspectionContext.assetName}. Selected aircraft is missing: ${inspectionContext.equipment.missingRequired.join(", ") || "required capability"}.`
          : `Inspection linked to ${inspectionContext.assetName}. No aircraft is assigned yet.`,
    );

    if (inspectionContext.equipment) {
      setSelectedAircraftId(inspectionContext.equipment.pilotAssetId);
      const profile = resolveCaptureCameraProfile({
        manufacturer: inspectionContext.equipment.manufacturer,
        model: inspectionContext.equipment.model,
        display_name: inspectionContext.equipment.displayName,
      });
      if (profile) {
        setHorizontalFovDeg(profile.horizontalFovDeg);
        setVerticalFovDeg(profile.verticalFovDeg);
        setCameraProfileMessage(
          `${profile.label}: ${profile.horizontalFovDeg}° horizontal · ${profile.verticalFovDeg.toFixed(1)}° vertical FOV applied from inspection equipment.`,
        );
      }
    }

    const rawTarget = inspectionContext.targetLocation;
    const target =
      rawTarget &&
      Number.isFinite(rawTarget.latitude) &&
      Number.isFinite(rawTarget.longitude)
        ? rawTarget
        : null;
    const hasAssetLocation =
      typeof inspectionContext.latitude === "number" &&
      typeof inspectionContext.longitude === "number";

    if (target) {
      setCenterLatitude(target.latitude);
      setCenterLongitude(target.longitude);
      if (hasAssetLocation) {
        setHomeLatitude(inspectionContext.latitude as number);
        setHomeLongitude(inspectionContext.longitude as number);
      } else {
        setHomeLatitude(target.latitude);
        setHomeLongitude(target.longitude);
      }
      const targetLabel = inspectionContext.followUpCapture
        ? `Follow-up target · ${inspectionContext.followUpCapture.findingTitle}`
        : `${inspectionContext.assetName} target`;
      setMapLocationLabel(targetLabel);
      setMapSearch(targetLabel);
      setMapFocusRevision((value) => value + 1);
      setPlanningSource("map");
    } else if (hasAssetLocation) {
      setCenterLatitude(inspectionContext.latitude as number);
      setCenterLongitude(inspectionContext.longitude as number);
      setHomeLatitude(inspectionContext.latitude as number);
      setHomeLongitude(inspectionContext.longitude as number);
      setMapLocationLabel(
        inspectionContext.locationLabel ?? inspectionContext.assetName,
      );
      setMapSearch(inspectionContext.locationLabel ?? inspectionContext.assetName);
      setMapFocusRevision((value) => value + 1);
      setPlanningSource("map");
    }

    if (inspectionContext.assetType === "roof" || inspectionContext.inspectionType === "roof") {
      setMissionType("roof");
    } else if (
      inspectionContext.assetType === "stockpile" ||
      inspectionContext.inspectionType === "stockpile"
    ) {
      setMissionType("stockpile");
    } else if (inspectionContext.assetType === "pipeline") {
      setMissionType("corridor");
    } else if (
      inspectionContext.assetType === "building" ||
      inspectionContext.assetType === "structure"
    ) {
      setMissionType("building");
    }
  }, [inspectionContext]);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data, error } = await sb
        .from("dominic_capture_plans")
        .select("id,name,mission_type,schema_version,plan_state,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (error) {
        setPlanPersistenceStatus("Saved plans could not be loaded.");
        return;
      }
      setSavedPlans((data ?? []) as SavedCapturePlan[]);
    })();
    return () => { active = false; };
  }, []);

  const persistedPlanState = (): PersistedCapturePlanState => ({
    objectDiameterFt,
    objectHeightFt,
    standoffFt,
    overlapPct,
    horizontalFovDeg,
    verticalFovDeg,
    centerLatitude,
    centerLongitude,
    baseRelativeAltitudeFt,
    homeLatitude,
    homeLongitude,
    minRelativeAltitudeFt,
    maxRelativeAltitudeFt,
    minStandoffFt,
    maxStandoffFt,
    noFlySectors,
    patternLengthFt,
    patternWidthFt,
    patternHeightFt,
    patternAltitudeFt,
    patternStandoffFt,
    patternOverlapPct,
    patternHeadingDeg,
    waypointOverrides,
    mapAreaPoints,
    mapLocationLabel,
    planningSource,
    inspectionId: inspectionContext?.inspectionId,
    assetId: inspectionContext?.assetId,
    assetName: inspectionContext?.assetName,
    inspectionType: inspectionContext?.inspectionType,
  });

  const refreshSavedPlans = async () => {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb
      .from("dominic_capture_plans")
      .select("id,name,mission_type,schema_version,plan_state,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    setSavedPlans((data ?? []) as SavedCapturePlan[]);
  };

  const saveCapturePlan = async () => {
    const cleanName = planName.trim();
    if (!cleanName) {
      setPlanPersistenceStatus("Give this capture plan a name before saving.");
      return;
    }
    setPlanPersistenceBusy(true);
    setPlanPersistenceStatus(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Your DOMINIC session expired.");

      const payload = {
        name: cleanName.slice(0, 120),
        mission_type: missionType,
        schema_version: 1,
        plan_state: persistedPlanState(),
      };

      let savedPlanId = activeSavedPlanId;
      if (activeSavedPlanId) {
        const { data, error } = await sb
          .from("dominic_capture_plans")
          .update(payload)
          .eq("id", activeSavedPlanId)
          .eq("user_id", userId)
          .select("id,name")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Saved plan not found.");
        savedPlanId = data.id;
        setPlanName(data.name);
      } else {
        const { data, error } = await sb
          .from("dominic_capture_plans")
          .insert({ ...payload, user_id: userId })
          .select("id,name")
          .single();
        if (error) throw error;
        savedPlanId = data.id;
        setActiveSavedPlanId(data.id);
        setPlanName(data.name);
      }

      if (inspectionContext && savedPlanId) {
        const captureSource =
          planningSource === "live"
            ? "live_drone"
            : planningSource === "local"
              ? "local_object"
              : "map";
        const { error: inspectionError } = await sb
          .from("dominic_inspections")
          .update({
            capture_plan_id: savedPlanId,
            capture_source: captureSource,
          })
          .eq("id", inspectionContext.inspectionId)
          .eq("user_id", userId);
        if (inspectionError) throw inspectionError;
      }

      await refreshSavedPlans();
      setPlanPersistenceStatus("Capture plan saved.");
      setReviewPreflightRan(false);
      setReviewFlightConfirmed(false);
      setShowAdvancedPlanner(false);
      setPlannerView("review");
    } catch (error) {
      setPlanPersistenceStatus(error instanceof Error ? error.message : "Capture plan could not be saved.");
    } finally {
      setPlanPersistenceBusy(false);
    }
  };

  const openCapturePlan = (saved: SavedCapturePlan) => {
    if (saved.schema_version !== 1) {
      setPlanPersistenceStatus("This saved plan uses an unsupported planner version.");
      return;
    }
    const state = saved.plan_state;
    setMissionType(saved.mission_type);
    setObjectDiameterFt(state.objectDiameterFt);
    setObjectHeightFt(state.objectHeightFt);
    setStandoffFt(state.standoffFt);
    setOverlapPct(state.overlapPct);
    setHorizontalFovDeg(state.horizontalFovDeg);
    setVerticalFovDeg(typeof state.verticalFovDeg === "number" ? state.verticalFovDeg : 60);
    setSelectedAircraftId("");
    setCameraProfileMessage("Saved camera geometry restored. Select an aircraft to refresh it from the DOM catalog.");
    setCenterLatitude(state.centerLatitude);
    setCenterLongitude(state.centerLongitude);
    setBaseRelativeAltitudeFt(state.baseRelativeAltitudeFt);
    setHomeLatitude(state.homeLatitude);
    setHomeLongitude(state.homeLongitude);
    setMinRelativeAltitudeFt(state.minRelativeAltitudeFt);
    setMaxRelativeAltitudeFt(state.maxRelativeAltitudeFt);
    setMinStandoffFt(state.minStandoffFt);
    setMaxStandoffFt(state.maxStandoffFt);
    setNoFlySectors(Array.isArray(state.noFlySectors) ? state.noFlySectors : []);
    setPatternLengthFt(state.patternLengthFt);
    setPatternWidthFt(state.patternWidthFt);
    setPatternHeightFt(state.patternHeightFt);
    setPatternAltitudeFt(state.patternAltitudeFt);
    setPatternStandoffFt(state.patternStandoffFt);
    setPatternOverlapPct(state.patternOverlapPct);
    setPatternHeadingDeg(state.patternHeadingDeg);
    setWaypointOverrides(state.waypointOverrides ?? {});
    setMapAreaPoints(Array.isArray(state.mapAreaPoints) ? state.mapAreaPoints : []);
    setMapAreaDefined(Array.isArray(state.mapAreaPoints) && state.mapAreaPoints.length >= 3);
    setMapLocationLabel(state.mapLocationLabel ?? null);
    setPlanningSource(state.planningSource ?? (saved.mission_type === "object" ? "local" : "map"));
    setMapFocusRevision((value) => value + 1);
    setSelectedWaypointId(null);

    // A reopened plan restores planning geometry only. Runtime capture/flight state
    // must be deliberately re-established for safety.
    setCurrentIndex(0);
    setSecondaryIndex(0);
    setCaptured({});
    setCaptureObservations([]);
    setSecondaryObservations([]);
    setSafety({});
    setMissionArmed(false);
    setGuidanceLock(false);
    setRealFlightApprovalSignature(null);
    setSecondaryFlightApprovalSignature(null);
    setAutonomousSnapshot(null);
    setAutonomousRunning(false);
    setActiveSavedPlanId(saved.id);
    setPlanName(saved.name);
    setPlanPersistenceStatus("Saved geometry loaded. Review the plan before flight.");
    setReviewPreflightRan(false);
    setReviewFlightConfirmed(false);
    setPlannerView("review");
  };


  const applyAircraftCamera = (assetId: string) => {
    setSelectedAircraftId(assetId);
    const aircraft = pilotAircraft.find((item) => item.id === assetId);
    if (!aircraft) {
      setCameraProfileMessage("Manual camera geometry active.");
      return;
    }
    const profile = resolveCaptureCameraProfile(aircraft);
    if (!profile) {
      setCameraProfileMessage("DOM recognizes this aircraft inventory record, but its camera geometry is payload-dependent or not yet cataloged. Enter FOV manually.");
      return;
    }
    setHorizontalFovDeg(profile.horizontalFovDeg);
    setVerticalFovDeg(profile.verticalFovDeg);
    setCameraProfileMessage(`${profile.label}: ${profile.horizontalFovDeg}° horizontal · ${profile.verticalFovDeg.toFixed(1)}° vertical FOV applied.`);
  };

  const plan = useMemo(
    () => calculateObjectScanPlan({ objectDiameterFt, objectHeightFt, standoffFt, overlapPct, horizontalFovDeg }),
    [objectDiameterFt, objectHeightFt, standoffFt, overlapPct, horizontalFovDeg],
  );
  const sequence = useMemo(() => buildCaptureSequence(plan), [plan]);
  const current = sequence[Math.min(currentIndex, sequence.length - 1)];
  const safetyReady = safetyItems.every((_, index) => safety[index]);
  const capturedCount = sequence.filter((shot) => captured[shot.id]).length;
  const relativeAircraftTelemetry = useMemo(
    () =>
      aircraftTelemetry
        ? deriveRelativeCaptureTelemetry({
            aircraft: aircraftTelemetry,
            centerLatitude,
            centerLongitude,
          })
        : null,
    [aircraftTelemetry, centerLatitude, centerLongitude],
  );
  const activeTelemetry =
    telemetryMode === "aircraft" && relativeAircraftTelemetry
      ? relativeAircraftTelemetry
      : {
          bearingDeg: telemetryBearingDeg,
          distanceFt: telemetryDistanceFt,
          cameraAngle: telemetryCameraAngle,
          stale: false,
          source: "simulator" as const,
        };
  const guidance = current
    ? evaluateCaptureGuidance(
        current,
        {
          bearingDeg: activeTelemetry.bearingDeg,
          distanceFt: activeTelemetry.distanceFt,
          cameraAngle: activeTelemetry.cameraAngle,
        },
        { bearingDeg: 5, distanceFt: 3, cameraAngle: 4 },
      )
    : null;
  const calibration = useMemo(
    () => ({
      homeLatitude,
      homeLongitude,
      minRelativeAltitudeFt,
      maxRelativeAltitudeFt,
      minStandoffFt,
      maxStandoffFt,
      noFlySectors,
    }),
    [
      homeLatitude,
      homeLongitude,
      minRelativeAltitudeFt,
      maxRelativeAltitudeFt,
      minStandoffFt,
      maxStandoffFt,
      noFlySectors,
    ],
  );

  const resetRun = () => {
    setCurrentIndex(0);
    setCaptured({});
    setCaptureObservations([]);
    setLastImageQuality(null);
    setImageAnalysisStatus("idle");
    setImageAnalysisMessage(null);
  };

  const snapTelemetryToCheckpoint = () => {
    if (!current) return;
    setTelemetryBearingDeg(current.bearingDeg);
    setTelemetryDistanceFt(Number(current.radiusFt.toFixed(1)));
    setTelemetryCameraAngle(current.cameraAngle);
  };

  const geographicCheckpoints = useMemo(
    () =>
      buildGeographicCheckpoints({
        plan,
        centerLatitude,
        centerLongitude,
        objectHeightFt,
        baseRelativeAltitudeFt,
      }),
    [plan, centerLatitude, centerLongitude, objectHeightFt, baseRelativeAltitudeFt],
  );

  const adaptiveCoverage = useMemo(
    () =>
      assessCoverage({
        checkpoints: geographicCheckpoints,
        observations: captureObservations,
        centerLatitude,
        centerLongitude,
      }),
    [geographicCheckpoints, captureObservations, centerLatitude, centerLongitude],
  );

  const repairPlan = useMemo(
    () =>
      buildRepairPlan({
        checkpoints: geographicCheckpoints,
        coverage: adaptiveCoverage,
        includeWeak: true,
      }),
    [geographicCheckpoints, adaptiveCoverage],
  );

  const realFlightPlanSignature = useMemo(
    () =>
      JSON.stringify({
        missionType,
        checkpoints: geographicCheckpoints.map((point) => [
          point.id,
          point.latitude,
          point.longitude,
          point.relativeAltitudeFt,
          point.cameraAngle,
        ]),
        calibration,
      }),
    [missionType, geographicCheckpoints, calibration],
  );
  const realFlightApproved =
    realFlightApprovalSignature === realFlightPlanSignature;

  const coverageByRing = useMemo(
    () => summarizeCoverageByRing(geographicCheckpoints, adaptiveCoverage),
    [geographicCheckpoints, adaptiveCoverage],
  );

  const analyzeCapturedImage = async (file: File) => {
    if (!current) return;
    const checkpoint = geographicCheckpoints.find((point) => point.id === current.id);
    if (!checkpoint) return;
    setImageAnalysisStatus("analyzing");
    setImageAnalysisMessage(null);
    try {
      const quality = await analyzeImageFile(file);
      setLastImageQuality(quality);
      const useLiveAircraft =
        telemetryMode === "aircraft" &&
        aircraftTelemetry &&
        !relativeAircraftTelemetry?.stale;
      const observation: CaptureObservation = {
        id: `image-${current.id}-${Date.now()}`,
        checkpointId: current.id,
        capturedAtMs: Date.now(),
        latitude: useLiveAircraft ? aircraftTelemetry.latitude : checkpoint.latitude,
        longitude: useLiveAircraft ? aircraftTelemetry.longitude : checkpoint.longitude,
        relativeAltitudeFt: useLiveAircraft ? aircraftTelemetry.relativeAltitudeFt : checkpoint.relativeAltitudeFt,
        cameraAngle: useLiveAircraft ? aircraftTelemetry.gimbalPitchDeg : current.cameraAngle,
        sharpnessScore: quality.sharpnessScore,
        exposureScore: quality.exposureScore,
        usable: quality.usable,
      };
      setCaptureObservations((observations) => [
        ...observations.filter((item) => item.checkpointId !== current.id),
        observation,
      ]);
      setCaptured((state) => ({ ...state, [current.id]: true }));
      setImageAnalysisStatus("done");
      setImageAnalysisMessage(
        quality.warnings.length ? quality.warnings.join(" ") : "Image quality meets the current DOMINIC capture policy.",
      );
    } catch (error) {
      setImageAnalysisStatus("error");
      setImageAnalysisMessage(error instanceof Error ? error.message : "Image analysis failed.");
    }
  };

  const markCaptured = () => {
    if (!current) return;
    const checkpoint = geographicCheckpoints.find((point) => point.id === current.id);
    if (!checkpoint) return;

    const useLiveAircraft =
      telemetryMode === "aircraft" &&
      aircraftTelemetry &&
      !relativeAircraftTelemetry?.stale;

    const observation: CaptureObservation = {
      id: `capture-${current.id}-${Date.now()}`,
      checkpointId: current.id,
      capturedAtMs: Date.now(),
      latitude: useLiveAircraft ? aircraftTelemetry.latitude : checkpoint.latitude,
      longitude: useLiveAircraft ? aircraftTelemetry.longitude : checkpoint.longitude,
      relativeAltitudeFt: useLiveAircraft
        ? aircraftTelemetry.relativeAltitudeFt
        : checkpoint.relativeAltitudeFt,
      cameraAngle: useLiveAircraft
        ? aircraftTelemetry.gimbalPitchDeg
        : current.cameraAngle,
      sharpnessScore: 0.95,
      exposureScore: 0.95,
      usable: true,
    };

    setCaptureObservations((observations) => [
      ...observations.filter((item) => item.checkpointId !== current.id),
      observation,
    ]);
    setCaptured((state) => ({ ...state, [current.id]: true }));
    setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1));
  };

  const markSkipped = () => {
    if (!current) return;
    setCaptured((state) => {
      const next = { ...state };
      delete next[current.id];
      return next;
    });
    setCaptureObservations((observations) =>
      observations.filter((item) => item.checkpointId !== current.id),
    );
    setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1));
  };

  const setObservationQuality = (checkpointId: string, score: number) => {
    setCaptureObservations((observations) =>
      observations.map((observation) =>
        observation.checkpointId === checkpointId
          ? { ...observation, sharpnessScore: score, exposureScore: score }
          : observation,
      ),
    );
  };

  const homeVector = useMemo(
    () =>
      bearingAndDistanceBetween({
        fromLatitude: centerLatitude,
        fromLongitude: centerLongitude,
        toLatitude: homeLatitude,
        toLongitude: homeLongitude,
      }),
    [centerLatitude, centerLongitude, homeLatitude, homeLongitude],
  );

  const simulateAircraftAtCheckpoint = () => {
    if (!current) return;
    const point = geographicCheckpoints.find((checkpoint) => checkpoint.id === current.id);
    if (!point) return;
    setAircraftTelemetry({
      latitude: point.latitude,
      longitude: point.longitude,
      relativeAltitudeFt: point.relativeAltitudeFt,
      headingDeg: (current.bearingDeg + 180) % 360,
      gimbalPitchDeg: current.cameraAngle,
      timestampMs: Date.now(),
      source: "simulator",
    });
    setTelemetryMode("aircraft");
  };

  const useBrowserAircraftPosition = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setAircraftTelemetry((previous) => ({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        relativeAltitudeFt: previous?.relativeAltitudeFt ?? baseRelativeAltitudeFt,
        headingDeg: previous?.headingDeg ?? 0,
        gimbalPitchDeg: previous?.gimbalPitchDeg ?? 0,
        timestampMs: Date.now(),
        source: "browser",
      }));
      setTelemetryMode("aircraft");
    });
  };


  const calibrationValidation = useMemo(
    () => validateMissionCalibration({ checkpoints: geographicCheckpoints, calibration }),
    [geographicCheckpoints, calibration],
  );
  const preflightReady = safetyReady && calibrationValidation.ready;
  const telemetryTrusted = telemetryMode === "simulator" || Boolean(relativeAircraftTelemetry && !relativeAircraftTelemetry.stale);
  const captureAllowed = missionArmed && preflightReady && telemetryTrusted && (!guidanceLock || Boolean(guidance?.ready));

  const addNoFlySector = () => {
    setMissionArmed(false);
    setNoFlySectors((current) => [
      ...current,
      {
        id: `sector-${current.length + 1}`,
        label: `No-fly sector ${current.length + 1}`,
        startBearingDeg: 0,
        endBearingDeg: 20,
      },
    ]);
  };

  const updateNoFlySector = (id: string, patch: Partial<NoFlySector>) => {
    setMissionArmed(false);
    setNoFlySectors((current) =>
      current.map((sector) => (sector.id === id ? { ...sector, ...patch } : sector)),
    );
  };

  const removeNoFlySector = (id: string) => {
    setMissionArmed(false);
    setNoFlySectors((current) => current.filter((sector) => sector.id !== id));
  };

  const persistInspectionBridgeMedia = async (
    capture: UniversalMediaCapture,
    file: File,
    quality: ImageQualityAssessment,
  ): Promise<{
    persisted: boolean;
    created: boolean;
    mediaId: string | null;
    sensorMode: string | null;
  }> => {
    if (!inspectionContext) {
      return { persisted: false, created: false, mediaId: null, sensorMode: null };
    }

    const sb = getSupabaseBrowser();
    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error("Your DOMINIC session expired.");

    const { data: existing, error: existingError } = await sb
      .from("dominic_inspection_media")
      .select("id,sensor_mode")
      .eq("user_id", userId)
      .eq("source_capture_id", capture.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return {
        persisted: true,
        created: false,
        mediaId: existing.id,
        sensorMode: existing.sensor_mode,
      };
    }

    const safeName = (capture.filename ?? file.name ?? `${capture.id}.jpg`)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || `${capture.id}.jpg`;
    const storagePath =
      `${userId}/dominic-inspections/${inspectionContext.inspectionId}/${capture.capturedAtMs}-${capture.id}-${safeName}`;

    const { error: uploadError } = await sb.storage
      .from("pilot-media")
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || capture.mimeType || "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const payloadKind = activeConnectedPayload?.kind;
    const sensorMode =
      payloadKind && payloadKind !== "other"
        ? payloadKind
        : inspectionContext.sensorModes[0] ?? "rgb";
    const rangefinderTarget = matchRangefinderTargetToCapture(
      bridgeAdapterRef.current?.getState().rangefinderTarget,
      capture.capturedAtMs,
    );
    const cameraPreset = inspectionContext.followUpCapture
      ? buildDominicInspectionCameraPreset({
          inspectionType: inspectionContext.inspectionType,
          targetDistanceM: inspectionContext.targetLocation?.distanceM ?? null,
          recommendedZoom: inspectionContext.followUpCapture.estimatedOpticalZoomMultiplier,
          hasFocusTarget: Boolean(inspectionContext.followUpCapture.focusTarget),
        })
      : null;

    const { data: insertedMedia, error: rowError } = await sb
      .from("dominic_inspection_media")
      .insert({
        user_id: userId,
        inspection_id: inspectionContext.inspectionId,
        asset_id: inspectionContext.assetId,
        sensor_mode: sensorMode,
        media_type: "image",
        storage_path: storagePath,
        original_filename: capture.filename ?? file.name,
        mime_type: file.type || capture.mimeType || "image/jpeg",
        captured_at: new Date(capture.capturedAtMs).toISOString(),
        latitude: capture.latitude,
        longitude: capture.longitude,
        relative_altitude_ft: capture.relativeAltitudeFt,
        source_capture_id: capture.id,
        source_aircraft_id: capture.aircraftId,
        analysis_status: "pending",
        analysis_summary: {
          captureQuality: {
            sharpnessScore: quality.sharpnessScore,
            exposureScore: quality.exposureScore,
            contrastScore: quality.contrastScore,
            shadowClipPct: quality.shadowClipPct,
            highlightClipPct: quality.highlightClipPct,
            usable: quality.usable,
            warnings: quality.warnings,
          },
        },
        metadata: {
          source: "flight_bridge",
          checkpointId: capture.checkpointId ?? null,
          headingDeg: capture.headingDeg,
          gimbalPitchDeg: capture.gimbalPitchDeg,
          gimbalYawDeg: capture.gimbalYawDeg ?? null,
          bridgeId: bridgeInfo?.bridgeId ?? null,
          vendor: bridgeInfo?.vendor ?? null,
          model: bridgeInfo?.model ?? null,
          payloadId: bridgeInfo?.activePayloadId ?? null,
          cameraSource: capture.cameraSource ?? null,
          zoomRatio: capture.zoomRatio ?? null,
          focusTarget: capture.focusTarget ?? null,
          aeLocked: capture.aeLocked ?? null,
          cameraPreset,
          rangefinderTarget: rangefinderTarget
            ? {
                ...rangefinderTarget,
                source: "connected_aircraft_laser",
              }
            : null,
          assetName: inspectionContext.assetName,
          inspectionType: inspectionContext.inspectionType,
        },
      })
      .select("id,sensor_mode")
      .single();

    if (rowError || !insertedMedia) {
      await sb.storage.from("pilot-media").remove([storagePath]);
      throw rowError ?? new Error("Inspection media record could not be created.");
    }

    await sb
      .from("dominic_inspections")
      .update({ status: "capturing" })
      .eq("id", inspectionContext.inspectionId)
      .eq("user_id", userId)
      .eq("status", "planned");

    return {
      persisted: true,
      created: true,
      mediaId: insertedMedia.id,
      sensorMode: insertedMedia.sensor_mode,
    };
  };

  const queueRealtimeInspectionScreening = (
    mediaId: string,
    sensorMode: string,
    quality: ImageQualityAssessment,
  ) => {
    if (!inspectionContext) return;

    const decision = decideRealtimeInspectionScreening({
      hasInspectionContext: true,
      inspectionType: inspectionContext.inspectionType,
      sensorMode,
      mediaType: "image",
      qualityUsable: quality.usable,
    });

    if (!decision.screen) {
      setAutomaticMediaStatus(
        `Evidence saved to ${inspectionContext.assetName}. ${realtimeScreeningReasonLabel(decision.reason)}`,
      );
      return;
    }

    realtimeScreeningQueueRef.current = realtimeScreeningQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setAutomaticMediaStatus(
          `Evidence saved to ${inspectionContext.assetName} · DOMINIC screening in progress…`,
        );

        const sb = getSupabaseBrowser();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Your DOMINIC session expired.");

        const response = await fetch(
          `/api/dominic/inspections/${inspectionContext.inspectionId}/analyze-media`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ mediaId }),
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (body?.code === "VISION_NOT_CONFIGURED") {
            setAutomaticMediaStatus(
              `Evidence saved to ${inspectionContext.assetName}. AI screening is not configured on this deployment.`,
            );
            return;
          }
          throw new Error(body?.error ?? "Automatic DOMINIC screening failed.");
        }

        const candidateCount = Number(body?.candidateCount ?? 0);
        const screenedFindings = Array.isArray(body?.findings)
          ? (body.findings as LiveInspectionFinding[]).filter(
              (finding) => finding.review_status === "needs_review",
            )
          : [];
        if (screenedFindings.length) {
          setLiveInspectionFindings((current) => {
            const byId = new Map(current.map((finding) => [finding.id, finding]));
            for (const finding of screenedFindings) byId.set(finding.id, finding);
            return Array.from(byId.values()).slice(-12);
          });
        }
        setAutomaticScreeningCount((count) => count + 1);
        setAutomaticMediaStatus(
          candidateCount > 0
            ? `DOMINIC screened the new capture and flagged ${candidateCount} candidate finding${candidateCount === 1 ? "" : "s"} for review.`
            : "DOMINIC screened the new capture and did not flag a visible anomaly.",
        );
      })
      .catch((error) => {
        setAutomaticMediaStatus(
          error instanceof Error
            ? `Evidence saved, but automatic screening failed: ${error.message}`
            : "Evidence saved, but automatic screening failed.",
        );
      });
  };

  const reviewLiveInspectionFinding = async (
    findingId: string,
    action: "confirm" | "dismiss",
  ) => {
    setLiveFindingReviewBusyId(findingId);
    try {
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your DOMINIC session expired.");

      const response = await fetch(`/api/dominic/findings/${findingId}/review`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "Finding review failed.");
      }

      setLiveInspectionFindings((current) =>
        current.map((finding) =>
          finding.id === findingId
            ? {
                ...finding,
                review_status: action === "confirm" ? "confirmed" : "dismissed",
              }
            : finding,
        ),
      );
      if (followUpFindingId === findingId) setFollowUpFindingId(null);
      setAutomaticMediaStatus(
        action === "confirm"
          ? body?.reusedIssue
            ? "Candidate confirmed. DOMINIC updated the existing issue history for this asset."
            : "Candidate confirmed. DOMINIC created a tracked issue for this asset."
          : "Candidate dismissed by the pilot/operator.",
      );
    } catch (error) {
      setAutomaticMediaStatus(
        error instanceof Error ? error.message : "Finding review failed.",
      );
    } finally {
      setLiveFindingReviewBusyId(null);
    }
  };

  const ingestBridgeMediaCapture = async (capture: UniversalMediaCapture) => {
    inspectionWatchCapturePendingRef.current = false;
    setAutomaticMediaStatus(`Received ${capture.filename ?? capture.id} from aircraft.`);
    if (!capture.mediaUrl) {
      setAutomaticMediaStatus("Aircraft reported a photo, but no media URL was provided for quality analysis.");
      return;
    }

    try {
      const response = await fetch(capture.mediaUrl);
      if (!response.ok) {
        throw new Error(`Unable to load aircraft capture (${response.status}).`);
      }
      const blob = await response.blob();
      const file = new File(
        [blob],
        capture.filename ?? `${capture.id}.jpg`,
        { type: blob.type || capture.mimeType || "image/jpeg" },
      );
      const quality = await analyzeImageFile(file);
      const observation: CaptureObservation = {
        id: capture.id,
        checkpointId: capture.checkpointId,
        capturedAtMs: capture.capturedAtMs,
        latitude: capture.latitude,
        longitude: capture.longitude,
        relativeAltitudeFt: capture.relativeAltitudeFt,
        cameraAngle: capture.gimbalPitchDeg,
        sharpnessScore: quality.sharpnessScore,
        exposureScore: quality.exposureScore,
        usable: quality.usable,
      };
      setCaptureObservations((observations) => [
        ...observations.filter((item) => item.id !== capture.id),
        observation,
      ]);
      if (capture.checkpointId) {
        setCaptured((state) => ({ ...state, [capture.checkpointId as string]: true }));
      }
      setLastImageQuality(quality);
      setImageAnalysisStatus("done");
      setImageAnalysisMessage(
        quality.warnings.length
          ? quality.warnings.join(" ")
          : "Aircraft capture automatically passed DOMINIC image-quality analysis.",
      );

      const persistence = await persistInspectionBridgeMedia(capture, file, quality);
      setAutomaticMediaCount((count) => count + 1);

      if (
        persistence.persisted &&
        persistence.created &&
        persistence.mediaId &&
        persistence.sensorMode &&
        inspectionContext
      ) {
        queueRealtimeInspectionScreening(
          persistence.mediaId,
          persistence.sensorMode,
          quality,
        );
      } else {
        setAutomaticMediaStatus(
          `${capture.filename ?? capture.id} analyzed automatically · sharpness ${Math.round(quality.sharpnessScore * 100)}% · exposure ${Math.round(quality.exposureScore * 100)}%${
            persistence.persisted && inspectionContext
              ? ` · saved to ${inspectionContext.assetName} inspection evidence`
              : ""
          }.`,
        );
      }

      const retryKey =
        inspectionContext?.followUpCapture?.findingId ??
        capture.checkpointId ??
        inspectionContext?.inspectionId ??
        capture.aircraftId;
      const attempts = qualityRecaptureAttemptsRef.current[retryKey] ?? 0;
      const recaptureDecision = decideInspectionQualityRecapture({
        quality,
        attempts,
      });

      if (
        recaptureDecision.retry &&
        inspectionContext?.followUpCapture &&
        bridgeStatus === "connected" &&
        bridgeInfo?.capabilities.photoCapture
      ) {
        const adapter = bridgeAdapterRef.current;
        if (!adapter) return;

        qualityRecaptureAttemptsRef.current[retryKey] = attempts + 1;
        setAutomaticMediaStatus(
          `${recaptureDecision.message} Automatic retry ${attempts + 1}/1.`,
        );

        if (recaptureDecision.refocus && bridgeInfo.capabilities.focusControl) {
          const focusTarget = inspectionContext.followUpCapture.focusTarget ?? { x: 0.5, y: 0.5 };
          const focusResult = await adapter.send({
            type: "setFocusTarget",
            x: Math.min(1, Math.max(0, focusTarget.x)),
            y: Math.min(1, Math.max(0, focusTarget.y)),
          });
          if (!focusResult.accepted) {
            setAutomaticMediaStatus(
              focusResult.message ?? "Automatic quality retry could not refocus the camera.",
            );
            return;
          }
        }

        if (recaptureDecision.unlockExposure && bridgeInfo.capabilities.aeLockControl) {
          const exposureResult = await adapter.send({ type: "setAELock", enabled: false });
          if (!exposureResult.accepted) {
            setAutomaticMediaStatus(
              exposureResult.message ?? "Automatic quality retry could not reset exposure.",
            );
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }

        const retryResult = await adapter.send({
          type: "capturePhoto",
          checkpointId: capture.checkpointId,
        });
        setAutomaticMediaStatus(
          retryResult.accepted
            ? `Automatic quality retry ${attempts + 1}/1 shutter accepted.`
            : retryResult.message ?? "Automatic quality retry was rejected by the aircraft.",
        );
      } else if (!quality.usable && !recaptureDecision.retry) {
        setAutomaticMediaStatus(
          `${capture.filename ?? capture.id} was saved, but DOMINIC will not retry again automatically. ${recaptureDecision.message}`,
        );
      }
    } catch (error) {
      setImageAnalysisStatus("error");
      setAutomaticMediaStatus(
        error instanceof Error
          ? `Aircraft image received, but automatic ingestion failed: ${error.message}`
          : "Aircraft image received, but automatic ingestion failed.",
      );
    }
  };

  const captureConnectedInspectionPhoto = async (origin: "manual" | "watch" = "manual") => {
    const adapter = bridgeAdapterRef.current;
    if (!adapter || bridgeStatus !== "connected") {
      setAutomaticMediaStatus("Connect the inspection camera bridge before capturing evidence.");
      return;
    }
    if (!bridgeInfo?.capabilities.photoCapture) {
      setAutomaticMediaStatus("The connected aircraft bridge does not expose still-photo capture.");
      return;
    }

    const followUp = inspectionContext?.followUpCapture ?? null;
    const cameraPreset =
      followUp && inspectionContext
        ? buildDominicInspectionCameraPreset({
            inspectionType: inspectionContext.inspectionType,
            targetDistanceM: inspectionContext.targetLocation?.distanceM ?? null,
            recommendedZoom: followUp.estimatedOpticalZoomMultiplier,
            hasFocusTarget: Boolean(followUp.focusTarget),
          })
        : null;
    let appliedZoom: number | null = null;

    if (followUp && cameraPreset) {
      if (bridgeInfo.capabilities.cameraSourceControl) {
        setAutomaticMediaStatus(
          `Applying ${cameraPreset.name} preset · switching to ${cameraPreset.cameraSource} camera…`,
        );
        const sourceResult = await adapter.send({
          type: "setCameraSource",
          source: cameraPreset.cameraSource,
        });
        if (!sourceResult.accepted) {
          setAutomaticMediaStatus(
            sourceResult.message ?? "Aircraft rejected the camera-source selection.",
          );
          return;
        }
      }

      if (cameraPreset.cameraSource === "zoom" && bridgeInfo.capabilities.zoomControl) {
        const minZoom = activeConnectedPayload?.minZoom ?? 1;
        const maxZoom = activeConnectedPayload?.maxZoom ?? 8;
        const zoomRatio = Math.min(maxZoom, Math.max(minZoom, cameraPreset.zoomRatio));
        setAutomaticMediaStatus(
          `Applying ${cameraPreset.name} preset · ${zoomRatio.toFixed(1)}x framing…`,
        );
        const zoomResult = await adapter.send({ type: "setZoom", ratio: zoomRatio });
        if (!zoomResult.accepted) {
          setAutomaticMediaStatus(
            zoomResult.message ?? "Aircraft rejected the recommended follow-up zoom.",
          );
          return;
        }
        appliedZoom = zoomRatio;
      } else if (cameraPreset.cameraSource === "wide") {
        appliedZoom = 1;
      }

      if (bridgeInfo.capabilities.focusControl) {
        const focusTarget =
          cameraPreset.focusStrategy === "anomaly" && followUp.focusTarget
            ? followUp.focusTarget
            : { x: 0.5, y: 0.5 };
        setAutomaticMediaStatus(
          cameraPreset.focusStrategy === "anomaly"
            ? "Focusing on the anomaly region…"
            : "Focusing on the frame center…",
        );
        const focusResult = await adapter.send({
          type: "setFocusTarget",
          x: Math.min(1, Math.max(0, focusTarget.x)),
          y: Math.min(1, Math.max(0, focusTarget.y)),
        });
        if (!focusResult.accepted) {
          setAutomaticMediaStatus(
            focusResult.message ?? "Aircraft rejected the autofocus target.",
          );
          return;
        }
      }

      if (cameraPreset.aeLock && bridgeInfo.capabilities.aeLockControl) {
        setAutomaticMediaStatus("Locking exposure for repeatable evidence…");
        const aeResult = await adapter.send({ type: "setAELock", enabled: true });
        if (!aeResult.accepted) {
          setAutomaticMediaStatus(
            aeResult.message ?? "Aircraft rejected automatic-exposure lock.",
          );
          return;
        }
      }
    }

    setAutomaticMediaStatus(
      followUp && cameraPreset
        ? `${cameraPreset.name} preset ready · ${cameraPreset.cameraSource}${appliedZoom !== null ? ` · ${appliedZoom.toFixed(1)}x` : ""} · requesting inspection photo…`
        : followUp
          ? `Follow-up capture ready · set about ${followUp.estimatedOpticalZoomMultiplier.toFixed(1)}x framing manually if needed · requesting photo…`
          : "Requesting inspection photo from the connected aircraft…",
    );
    const result = await adapter.send({
      type: "capturePhoto",
      checkpointId: selectedWaypointId ?? current?.id,
    });
    if (origin === "watch") {
      inspectionWatchCapturePendingRef.current = result.accepted;
      inspectionWatchLastRequestedAtRef.current = Date.now();
      if (result.accepted) setInspectionWatchCaptureCount((count) => count + 1);
    }
    setAutomaticMediaStatus(
      result.accepted
        ? `${origin === "watch" ? "Inspection Watch · " : ""}${appliedZoom !== null ? `Zoom ${appliedZoom.toFixed(1)}x · ` : ""}shutter accepted. Waiting for the aircraft media file…`
        : result.message ?? "Aircraft rejected the photo capture request.",
    );
  };

  const watchReadiness = inspectionWatchReadiness({
    enabled: inspectionWatchEnabled,
    hasInspectionContext: Boolean(inspectionContext),
    equipmentReady: !inspectionContext || inspectionContext.equipment?.ready === true,
    bridgeConnected: bridgeStatus === "connected",
    photoCaptureSupported: Boolean(bridgeInfo?.capabilities.photoCapture),
    capturePending: inspectionWatchCapturePendingRef.current,
  });

  useEffect(() => {
    if (!inspectionWatchEnabled) return;

    const intervalMs = normalizeInspectionWatchInterval(inspectionWatchIntervalSec) * 1000;
    const timer = window.setInterval(() => {
      const readiness = inspectionWatchReadiness({
        enabled: true,
        hasInspectionContext: Boolean(inspectionContext),
        equipmentReady: !inspectionContext || inspectionContext.equipment?.ready === true,
        bridgeConnected: bridgeStatus === "connected",
        photoCaptureSupported: Boolean(bridgeInfo?.capabilities.photoCapture),
        capturePending: inspectionWatchCapturePendingRef.current,
      });

      if (!readiness.ready) return;
      if (Date.now() - inspectionWatchLastRequestedAtRef.current < intervalMs) return;

      inspectionWatchCapturePendingRef.current = true;
      inspectionWatchLastRequestedAtRef.current = Date.now();
      void captureConnectedInspectionPhoto("watch").catch((error) => {
        inspectionWatchCapturePendingRef.current = false;
        setAutomaticMediaStatus(
          error instanceof Error
            ? `Inspection Watch capture failed: ${error.message}`
            : "Inspection Watch capture failed.",
        );
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    inspectionWatchEnabled,
    inspectionWatchIntervalSec,
    inspectionContext,
    inspectionEquipmentReady,
    bridgeStatus,
    bridgeInfo?.capabilities.photoCapture,
  ]);

  const connectAircraftBridge = async () => {
    if (bridgeStatus === "connecting" || bridgeStatus === "connected") return;
    setBridgeStatus("connecting");
    setBridgeError(null);
    try {
      const transport = new WebSocketFlightBridgeTransport(bridgeUrl);
      const { adapter, hello } = await connectFlightBridgeAdapter(transport, 5000);
      bridgeAdapterRef.current = adapter;
      bridgeUnsubscribeRef.current = adapter.subscribe((state) => {
        setAircraftTelemetry({
          latitude: state.latitude,
          longitude: state.longitude,
          relativeAltitudeFt: state.relativeAltitudeFt,
          headingDeg: state.headingDeg,
          gimbalPitchDeg: state.gimbalPitchDeg,
          timestampMs: state.timestampMs,
          source: "external",
        });
      });
      bridgeMediaUnsubscribeRef.current = adapter.subscribeMedia
        ? adapter.subscribeMedia((capture) => {
            void ingestBridgeMediaCapture(capture);
          })
        : null;
      setBridgeInfo({
        bridgeId: hello.bridgeId,
        vendor: hello.vendor,
        model: hello.model,
        aircraftId: hello.aircraftId,
        capabilities: hello.capabilities,
        payloads: hello.payloads ?? [],
        activePayloadId: hello.activePayloadId,
      });
      setTelemetryMode("aircraft");
      setBridgeStatus("connected");
    } catch (error) {
      setBridgeStatus("error");
      setBridgeError(error instanceof Error ? error.message : "Unable to connect to Flight Bridge.");
    }
  };

  const runConnectedBenchReadiness = async () => {
    const adapter = bridgeAdapterRef.current;
    if (!adapter || bridgeStatus !== "connected" || benchRunning) return;

    setBenchRunning(true);
    setBenchReport(null);
    try {
      const report = await runBenchReadiness(adapter, {
        requireRtkFixed: benchRequireRtk,
        minimumBatteryPercent: 40,
        telemetryMaxAgeMs: 3000,
        commandTimeoutMs: 3000,
        mediaTimeoutMs: 5000,
        testCommandRoundTrips: true,
        testMediaCapture: true,
      });
      setBenchReport(report);
      if (report.readyForPropOnFieldTest && bridgeInfo) {
        const fingerprint = aircraftFingerprint({
          vendor: bridgeInfo.vendor,
          aircraftId: bridgeInfo.aircraftId,
          model: bridgeInfo.model,
        });
        setFlightValidation((current) =>
          updateBenchVerification(
            current &&
              current.aircraftFingerprint === fingerprint &&
              current.planSignature === activeValidationPlanSignature
              ? current
              : {
                  aircraftFingerprint: fingerprint,
                  planSignature: activeValidationPlanSignature,
                },
            report,
          ),
        );
      }
    } finally {
      setBenchRunning(false);
    }
  };

  const disconnectAircraftBridge = async () => {
    bridgeUnsubscribeRef.current?.();
    bridgeUnsubscribeRef.current = null;
    bridgeMediaUnsubscribeRef.current?.();
    bridgeMediaUnsubscribeRef.current = null;
    const adapter = bridgeAdapterRef.current;
    bridgeAdapterRef.current = null;
    if (adapter) await adapter.disconnect();
    setInspectionWatchEnabled(false);
    inspectionWatchCapturePendingRef.current = false;
    setBridgeInfo(null);
    setBridgeStatus("disconnected");
    setBridgeError(null);
    setAutomaticMediaStatus(null);
    setRealFlightApprovalSignature(null);
    setBenchReport(null);
    setFlightValidation(null);
    setControlledFieldNotes("");
    setValidationMessage(null);
  };

  const pilotAccessToken = async () => {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token ?? "";
  };

  const loadRecentFlightRuns = async () => {
    setFlightHistoryLoading(true);
    try {
      const token = await pilotAccessToken();
      if (!token) return;
      const response = await fetch("/api/pilot/dominic/flights?limit=8", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setRecentFlightRuns(Array.isArray(body?.runs) ? body.runs : []);
    } finally {
      setFlightHistoryLoading(false);
    }
  };

  const startFlightAudit = async (input: {
    missionType: CaptureMissionType;
    mode: "full" | "repair";
    checkpoints: Array<{
      id: string;
      sequence: number;
      latitude: number;
      longitude: number;
      relativeAltitudeFt: number;
      cameraAngle: number;
    }>;
    aircraft: {
      vendor: string;
      model?: string;
      aircraftId?: string;
      bridgeId?: string;
    };
    capabilities?: AircraftCapabilities;
    payload?: CameraPayloadProfile | null;
    coverageSummary?: Record<string, unknown>;
    planSignature?: string;
    calibrationSnapshot?: unknown;
  }) => {
    const token = await pilotAccessToken();
    if (!token) return null;
    const response = await fetch("/api/pilot/dominic/flights", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        missionType: input.missionType,
        aircraft: input.aircraft,
        capabilities: input.capabilities ?? {},
        payload: input.payload ?? {},
        plan: {
          mode: input.mode,
          checkpointCount: input.checkpoints.length,
          checkpointIds: input.checkpoints.map((checkpoint) => checkpoint.id),
          planSignature: input.planSignature ?? null,
          centerLatitude,
          centerLongitude,
        },
        calibration: input.calibrationSnapshot ?? {},
        coverageSummary: input.coverageSummary ?? {},
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.run?.id === "string" ? body.run.id : null;
  };

  const finishFlightAudit = async (input: {
    runId: string;
    snapshot: MissionExecutionSnapshot;
    observations: CaptureObservation[];
    coverageSummary: Record<string, unknown>;
  }) => {
    const token = await pilotAccessToken();
    if (!token) return false;

    const auditEventAtMs =
      input.snapshot.events.at(-1)?.atMs ??
      input.snapshot.lastAircraftState?.timestampMs ??
      0;
    const status =
      input.snapshot.phase === "COMPLETE"
        ? "complete"
        : input.snapshot.phase === "ABORTED"
          ? "aborted"
          : input.snapshot.phase === "FAILED"
            ? "failed"
            : input.snapshot.phase === "PAUSED"
              ? "paused"
              : "started";

    const events: Array<{
      atMs: number;
      phase: string;
      message: string;
      checkpointId?: string;
      aircraftState?: MissionExecutionSnapshot["lastAircraftState"] | null;
      details?: Record<string, unknown>;
    }> = input.snapshot.events.map((event) => ({
      atMs: event.atMs,
      phase: event.phase,
      message: event.message,
      checkpointId: event.checkpointId,
    }));
    events.push({
      atMs: auditEventAtMs,
      phase: input.snapshot.phase,
      message: "DOMINIC execution snapshot persisted.",
      checkpointId: input.snapshot.currentCheckpointId,
      aircraftState: input.snapshot.lastAircraftState ?? null,
      details: {
        completedCheckpointIds: input.snapshot.completedCheckpointIds,
        safetyIssues: input.snapshot.safetyIssues,
      },
    });

    const response = await fetch("/api/pilot/dominic/flights", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        runId: input.runId,
        status,
        failureMessage: status === "failed" ? input.snapshot.error ?? "Mission failed." : undefined,
        coverageSummary: input.coverageSummary,
        events,
        observations: input.observations,
      }),
    });
    return response.ok;
  };

  const runAutonomousSimulation = async (
    mode: "full" | "repair" = "full",
  ) => {
    if (!preflightReady || autonomousRunning) return;
    const checkpoints =
      mode === "repair" ? repairPlan : geographicCheckpoints;
    if (!checkpoints.length) return;

    setAutonomousMode(mode);
    setAutonomousTarget("simulator");
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);
    setFlightAuditStatus("saving");

    const aircraft = new SimulatorAircraftAdapter({
      latitude: homeLatitude,
      longitude: homeLongitude,
      homeLatitude,
      homeLongitude,
    });
    let auditRunId: string | null = null;
    try {
      const payload =
        aircraft.payloads?.find((item) => item.id === aircraft.activePayloadId) ??
        aircraft.payloads?.[0] ??
        null;
      auditRunId = await startFlightAudit({
        missionType: "object",
        mode,
        checkpoints,
        aircraft: {
          vendor: aircraft.vendor,
          model: aircraft.getState().model,
          aircraftId: aircraft.getState().aircraftId,
        },
        capabilities: aircraft.capabilities,
        payload,
        coverageSummary: adaptiveCoverage as unknown as Record<string, unknown>,
        planSignature: realFlightPlanSignature,
        calibrationSnapshot: calibration,
      });
      if (auditRunId) setLastFlightRunId(auditRunId);
    } catch {
      auditRunId = null;
    }

    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude,
      centerLongitude,
      checkpoints,
      takeoffAltitudeFt: Math.max(
        10,
        Math.min(40, checkpoints[0]?.relativeAltitudeFt ?? 20),
      ),
      transitSpeedFps: 12,
    });
    autonomousEngineRef.current = engine;
    setMissionControlMessage(null);
    const unsubscribe = engine.subscribe((snapshot) => setAutonomousSnapshot(snapshot));
    const result = await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(result);
    if (
      mode === "full" &&
      result.phase === "COMPLETE" &&
      bridgeInfo
    ) {
      const fingerprint = aircraftFingerprint({
        vendor: bridgeInfo.vendor,
        aircraftId: bridgeInfo.aircraftId,
        model: bridgeInfo.model,
      });
      setFlightValidation((current) =>
        updateSimulationVerification(
          current &&
            current.aircraftFingerprint === fingerprint &&
            current.planSignature === realFlightPlanSignature
            ? current
            : {
                aircraftFingerprint: fingerprint,
                planSignature: realFlightPlanSignature,
                benchVerifiedAtMs: benchReport?.readyForPropOnFieldTest
                  ? benchReport.generatedAtMs
                  : undefined,
              },
        ),
      );
    }
    if (auditRunId) {
      try {
        const saved = await finishFlightAudit({
          runId: auditRunId,
          snapshot: result,
          observations: captureObservations,
          coverageSummary: adaptiveCoverage as unknown as Record<string, unknown>,
        });
        setFlightAuditStatus(saved ? "saved" : "error");
        if (saved) void loadRecentFlightRuns();
      } catch {
        setFlightAuditStatus("error");
      }
    } else {
      setFlightAuditStatus("error");
    }

    autonomousEngineRef.current = null;
    setAutonomousRunning(false);
  };

  const runSafetyScenario = async () => {
    if (!preflightReady || autonomousRunning) return;
    setAutonomousMode("full");
    setAutonomousTarget("simulator");
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);
    setSafetyScenarioResult(null);

    const baseAircraft = new SimulatorAircraftAdapter({
      latitude: homeLatitude,
      longitude: homeLongitude,
      homeLatitude,
      homeLongitude,
      batteryPercent: 90,
      satellites: 18,
      gnssQuality: "good",
      rtkState: "fixed",
    });
    const aircraft = new SafetyScenarioAircraftAdapter(
      baseAircraft,
      safetyScenario,
    );
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude,
      centerLongitude,
      checkpoints: geographicCheckpoints.slice(
        0,
        Math.min(4, geographicCheckpoints.length),
      ),
      takeoffAltitudeFt: Math.max(
        10,
        Math.min(40, geographicCheckpoints[0]?.relativeAltitudeFt ?? 20),
      ),
      transitSpeedFps: 12,
      arrivalTimeoutMs: 800,
      safetyPollIntervalMs: 10,
      safetyPolicy:
        safetyScenario === "telemetry_loss_on_first_transit"
          ? { telemetryStaleAfterMs: 40 }
          : safetyScenario === "obstacle_on_first_transit"
            ? { obstacleAction: "return_home" }
            : undefined,
    });

    autonomousEngineRef.current = engine;
    const unsubscribe = engine.subscribe((snapshot) =>
      setAutonomousSnapshot(snapshot),
    );
    const result = await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(result);
    autonomousEngineRef.current = null;
    setAutonomousRunning(false);

    const intervention = result.events
      .slice()
      .reverse()
      .find(
        (event) =>
          event.message.includes("Safety") ||
          event.message.includes("Emergency recovery"),
      );
    setSafetyScenarioResult(
      intervention?.message ??
        (result.phase === "COMPLETE"
          ? "Scenario completed without a safety intervention."
          : result.error ?? "Scenario ended without a reported intervention."),
    );
  };

  const runConnectedAircraftMission = async (
    mode: "full" | "repair" = "full",
  ) => {
    if (!preflightReady || autonomousRunning || !realFlightApproved) return;
    if (bridgeStatus !== "connected") return;
    if (!productionFlightUnlocked) {
      setMissionControlMessage("Connected aircraft has not completed DOMINIC's staged flight validation ladder.");
      return;
    }
    if (!benchReport?.readyForPropOnFieldTest) {
      setMissionControlMessage("Connected aircraft has not passed DOMINIC field-test readiness.");
      return;
    }
    const adapter = bridgeAdapterRef.current;
    if (!adapter) return;

    const checkpoints =
      mode === "repair" ? repairPlan : geographicCheckpoints;
    if (!checkpoints.length) return;

    setAutonomousMode(mode);
    setAutonomousTarget("connected");
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);
    setFlightAuditStatus("saving");

    let auditRunId: string | null = null;
    try {
      auditRunId = await startFlightAudit({
        missionType: "object",
        mode,
        checkpoints,
        aircraft: {
          vendor: bridgeInfo?.vendor ?? adapter.vendor,
          model: bridgeInfo?.model ?? adapter.getState().model,
          aircraftId: bridgeInfo?.aircraftId ?? adapter.getState().aircraftId,
          bridgeId: bridgeInfo?.bridgeId,
        },
        capabilities: adapter.capabilities,
        payload: activeConnectedPayload,
        coverageSummary: adaptiveCoverage as unknown as Record<string, unknown>,
        planSignature: realFlightPlanSignature,
        calibrationSnapshot: calibration,
      });
      if (auditRunId) setLastFlightRunId(auditRunId);
    } catch {
      auditRunId = null;
    }

    const engine = new DominicMissionEngine(adapter, {
      centerLatitude,
      centerLongitude,
      checkpoints,
      takeoffAltitudeFt: Math.max(
        10,
        Math.min(40, checkpoints[0]?.relativeAltitudeFt ?? 20),
      ),
      transitSpeedFps: 12,
    });
    autonomousEngineRef.current = engine;
    setMissionControlMessage(null);
    const unsubscribe = engine.subscribe((snapshot) =>
      setAutonomousSnapshot(snapshot),
    );
    const result = await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(result);

    if (auditRunId) {
      try {
        const saved = await finishFlightAudit({
          runId: auditRunId,
          snapshot: result,
          observations: captureObservations,
          coverageSummary: adaptiveCoverage as unknown as Record<string, unknown>,
        });
        setFlightAuditStatus(saved ? "saved" : "error");
        if (saved) void loadRecentFlightRuns();
      } catch {
        setFlightAuditStatus("error");
      }
    } else {
      setFlightAuditStatus("error");
    }

    autonomousEngineRef.current = null;
    setAutonomousRunning(false);
    setRealFlightApprovalSignature(null);
  };

  const runSecondarySimulation = async (mode: "full" | "repair" = "full") => {
    const checkpoints = mode === "repair" ? secondaryRepairPlan : effectiveSecondaryGeographicCheckpoints;
    if (autonomousRunning || !checkpoints.length || !secondaryCalibrationValidation.ready) {
      if (!secondaryCalibrationValidation.ready) {
        setMissionControlMessage("Pattern mission is blocked by calibration or no-fly constraints.");
      }
      return;
    }
    setAutonomousMode(mode);
    setAutonomousTarget("simulator");
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);
    setMissionControlMessage(null);
    setFlightAuditStatus("saving");

    const aircraft = new SimulatorAircraftAdapter({
      latitude: homeLatitude,
      longitude: homeLongitude,
      homeLatitude,
      homeLongitude,
      batteryPercent: 90,
      satellites: 18,
      gnssQuality: "good",
      rtkState: "fixed",
    });

    let auditRunId: string | null = null;
    try {
      const payload =
        aircraft.payloads?.find((item) => item.id === aircraft.activePayloadId) ??
        aircraft.payloads?.[0] ??
        null;
      auditRunId = await startFlightAudit({
        missionType,
        mode,
        checkpoints,
        aircraft: {
          vendor: aircraft.vendor,
          model: aircraft.getState().model,
          aircraftId: aircraft.getState().aircraftId,
        },
        capabilities: aircraft.capabilities,
        payload,
        coverageSummary: secondaryCoverage as unknown as Record<string, unknown>,
        planSignature: secondaryFlightPlanSignature,
        calibrationSnapshot: secondaryCalibrationValidation,
      });
      if (auditRunId) setLastFlightRunId(auditRunId);
    } catch {
      auditRunId = null;
    }

    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude,
      centerLongitude,
      checkpoints,
      takeoffAltitudeFt: Math.max(
        10,
        Math.min(
          40,
          checkpoints[0]?.relativeAltitudeFt ?? 20,
        ),
      ),
      transitSpeedFps: 12,
    });
    autonomousEngineRef.current = engine;
    const unsubscribe = engine.subscribe((snapshot) =>
      setAutonomousSnapshot(snapshot),
    );
    const result = await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(result);
    if (result.phase === "COMPLETE" && bridgeInfo) {
      const fingerprint = aircraftFingerprint({
        vendor: bridgeInfo.vendor,
        aircraftId: bridgeInfo.aircraftId,
        model: bridgeInfo.model,
      });
      setFlightValidation((current) =>
        updateSimulationVerification(
          current &&
            current.aircraftFingerprint === fingerprint &&
            current.planSignature === secondaryFlightPlanSignature
            ? current
            : {
                aircraftFingerprint: fingerprint,
                planSignature: secondaryFlightPlanSignature,
                benchVerifiedAtMs: benchReport?.readyForPropOnFieldTest
                  ? benchReport.generatedAtMs
                  : undefined,
              },
        ),
      );
    }

    if (auditRunId) {
      try {
        const saved = await finishFlightAudit({
          runId: auditRunId,
          snapshot: result,
          observations: secondaryObservations,
          coverageSummary: secondaryCoverage as unknown as Record<string, unknown>,
        });
        setFlightAuditStatus(saved ? "saved" : "error");
        if (saved) void loadRecentFlightRuns();
      } catch {
        setFlightAuditStatus("error");
      }
    } else {
      setFlightAuditStatus("error");
    }

    autonomousEngineRef.current = null;
    setAutonomousRunning(false);
  };

  const runSecondaryConnectedMission = async (mode: "full" | "repair" = "full") => {
    const checkpoints = mode === "repair" ? secondaryRepairPlan : effectiveSecondaryGeographicCheckpoints;
    if (
      autonomousRunning ||
      !checkpoints.length ||
      !secondaryFlightApproved ||
      !secondaryCalibrationValidation.ready ||
      bridgeStatus !== "connected" ||
      !productionFlightUnlocked ||
      !benchReport?.readyForPropOnFieldTest ||
      missionType === "interior"
    ) {
      return;
    }
    const adapter = bridgeAdapterRef.current;
    if (!adapter) return;

    setAutonomousMode(mode);
    setAutonomousTarget("connected");
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);
    setMissionControlMessage(null);
    setFlightAuditStatus("saving");

    let auditRunId: string | null = null;
    try {
      auditRunId = await startFlightAudit({
        missionType,
        mode,
        checkpoints,
        aircraft: {
          vendor: bridgeInfo?.vendor ?? adapter.vendor,
          model: bridgeInfo?.model ?? adapter.getState().model,
          aircraftId: bridgeInfo?.aircraftId ?? adapter.getState().aircraftId,
          bridgeId: bridgeInfo?.bridgeId,
        },
        capabilities: adapter.capabilities,
        payload: activeConnectedPayload,
        coverageSummary: secondaryCoverage as unknown as Record<string, unknown>,
        planSignature: secondaryFlightPlanSignature,
        calibrationSnapshot: secondaryCalibrationValidation,
      });
      if (auditRunId) setLastFlightRunId(auditRunId);
    } catch {
      auditRunId = null;
    }

    const engine = new DominicMissionEngine(adapter, {
      centerLatitude,
      centerLongitude,
      checkpoints,
      takeoffAltitudeFt: Math.max(
        10,
        Math.min(
          40,
          checkpoints[0]?.relativeAltitudeFt ?? 20,
        ),
      ),
      transitSpeedFps: 12,
    });
    autonomousEngineRef.current = engine;
    const unsubscribe = engine.subscribe((snapshot) =>
      setAutonomousSnapshot(snapshot),
    );
    const result = await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(result);

    if (auditRunId) {
      try {
        const saved = await finishFlightAudit({
          runId: auditRunId,
          snapshot: result,
          observations: secondaryObservations,
          coverageSummary: secondaryCoverage as unknown as Record<string, unknown>,
        });
        setFlightAuditStatus(saved ? "saved" : "error");
        if (saved) void loadRecentFlightRuns();
      } catch {
        setFlightAuditStatus("error");
      }
    } else {
      setFlightAuditStatus("error");
    }

    autonomousEngineRef.current = null;
    setAutonomousRunning(false);
    setSecondaryFlightApprovalSignature(null);
  };

  const recordControlledFieldValidation = () => {
    if (!bridgeInfo) return;
    const fingerprint = aircraftFingerprint({
      vendor: bridgeInfo.vendor,
      aircraftId: bridgeInfo.aircraftId,
      model: bridgeInfo.model,
    });
    try {
      const base =
        flightValidation &&
        flightValidation.aircraftFingerprint === fingerprint &&
        flightValidation.planSignature === activeValidationPlanSignature
          ? flightValidation
          : {
              aircraftFingerprint: fingerprint,
              planSignature: activeValidationPlanSignature,
            };
      const updated = attestControlledFieldValidation(base, {
        notes: controlledFieldNotes,
      });
      setFlightValidation(updated);
      setValidationMessage("Controlled field validation recorded for this aircraft and capture plan.");
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : "Unable to record controlled field validation.",
      );
    }
  };

  const pauseActiveMission = async () => {
    const engine = autonomousEngineRef.current;
    if (!engine) return;
    try {
      await engine.pause();
      setMissionControlMessage("Mission paused. Aircraft remains under the connected adapter's hold behavior.");
    } catch (error) {
      setMissionControlMessage(
        error instanceof Error ? error.message : "Unable to pause mission.",
      );
    }
  };

  const resumeActiveMission = async () => {
    const engine = autonomousEngineRef.current;
    if (!engine) return;
    try {
      await engine.resume();
      setMissionControlMessage("DOMINIC safety checks are clear. Mission resumed.");
    } catch (error) {
      setMissionControlMessage(
        error instanceof Error ? error.message : "Unable to resume mission.",
      );
    }
  };

  const abortActiveMission = async () => {
    const engine = autonomousEngineRef.current;
    if (!engine) return;
    setMissionControlMessage("Operator abort requested. DOMINIC is handing emergency recovery to the aircraft adapter.");
    await engine.abort("Operator abort from DOMINIC Capture Planner.");
  };

  const downloadCheckpointPayload = () => {
    const payload = {
      schema: "dominic.capture-plan.v1",
      missionType: plan.missionType,
      generatedAt: new Date().toISOString(),
      object: {
        diameterFt: objectDiameterFt,
        heightFt: objectHeightFt,
        standoffFt,
      },
      overlapPct,
      horizontalFovDeg,
      safetyConstraints: safetyItems,
      subjectCenter: {
        latitude: centerLatitude,
        longitude: centerLongitude,
        baseRelativeAltitudeFt,
      },
      checkpoints: buildAutonomousCheckpoints(plan),
      geographicCheckpoints,
      calibration,
      calibrationValidation,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dominic-object-scan-checkpoints.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const secondaryPlan = useMemo(() => {
    if (missionType === "object") return null;
    switch (missionType) {
      case "roof":
        return calculateRoofPlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          altitudeFt: patternAltitudeFt,
          frontOverlapPct: patternOverlapPct,
          sideOverlapPct: Math.max(40, patternOverlapPct - 5),
          horizontalFovDeg,
          verticalFovDeg,
          includeObliques: true,
        });
      case "building":
        return calculateBuildingPlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          heightFt: patternHeightFt,
          standoffFt: patternStandoffFt,
          overlapPct: patternOverlapPct,
          horizontalFovDeg,
          verticalFovDeg,
        });
      case "facade":
        return calculateFacadePlan({
          widthFt: patternWidthFt,
          heightFt: patternHeightFt,
          standoffFt: patternStandoffFt,
          overlapPct: patternOverlapPct,
          horizontalFovDeg,
          verticalFovDeg,
        });
      case "interior":
        return calculateInteriorPlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          heightFt: patternHeightFt,
          wallStandoffFt: Math.min(6, Math.max(2, patternStandoffFt / 5)),
        });
      case "stockpile":
        return calculateStockpilePlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          pileHeightFt: patternHeightFt,
          altitudeAboveTopFt: patternAltitudeFt,
          overlapPct: patternOverlapPct,
          horizontalFovDeg,
          verticalFovDeg,
        });
      case "corridor":
        return calculateCorridorPlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          altitudeFt: patternAltitudeFt,
          frontOverlapPct: patternOverlapPct,
          sideOverlapPct: Math.max(40, patternOverlapPct - 10),
          horizontalFovDeg,
          verticalFovDeg,
        });
    }
  }, [
    missionType,
    patternLengthFt,
    patternWidthFt,
    patternHeightFt,
    patternAltitudeFt,
    patternStandoffFt,
    patternOverlapPct,
    horizontalFovDeg,
    verticalFovDeg,
  ]);

  const secondaryGeographicCheckpoints = secondaryPlan
    ? georeferencePattern(
        secondaryPlan,
        centerLatitude,
        centerLongitude,
        patternHeadingDeg,
      )
    : [];
  const effectiveSecondaryGeographicCheckpoints = secondaryGeographicCheckpoints.map((point) => {
    const override = waypointOverrides[point.id];
    return override ? { ...point, ...override } : point;
  });
  const secondaryCalibrationValidation = validatePatternCalibration({
    checkpoints: effectiveSecondaryGeographicCheckpoints,
    centerLatitude,
    centerLongitude,
    calibration,
  });

  const downloadSecondaryCheckpointPayload = () => {
    if (!secondaryPlan) return;
    const payload = {
      schema: "dominic.capture-plan.v1",
      missionType,
      generatedAt: new Date().toISOString(),
      geometry: {
        lengthFt: patternLengthFt,
        widthFt: patternWidthFt,
        heightFt: patternHeightFt,
        altitudeFt: patternAltitudeFt,
        standoffFt: patternStandoffFt,
        overlapPct: patternOverlapPct,
        headingDeg: patternHeadingDeg,
      },
      camera: {
        horizontalFovDeg,
        verticalFovDeg,
      },
      subjectCenter: {
        latitude: centerLatitude,
        longitude: centerLongitude,
      },
      plan: {
        passCount: secondaryPlan.passCount,
        estimatedMinutes: secondaryPlan.estimatedMinutes,
        warnings: secondaryPlan.warnings,
        metrics: secondaryPlan.metrics,
      },
      checkpoints: secondaryPlan.checkpoints,
      geographicCheckpoints: effectiveSecondaryGeographicCheckpoints,
      repairCheckpoints: secondaryRepairPlan,
      calibration,
      calibrationValidation: secondaryCalibrationValidation,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dominic-${missionType}-checkpoints.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activeSecondaryIndex = Math.min(
    secondaryIndex,
    Math.max(0, effectiveSecondaryGeographicCheckpoints.length - 1),
  );
  const currentSecondaryCheckpoint =
    effectiveSecondaryGeographicCheckpoints[activeSecondaryIndex] ?? null;
  const secondaryCoverage = assessCoverage({
    checkpoints: effectiveSecondaryGeographicCheckpoints,
    observations: secondaryObservations,
    centerLatitude,
    centerLongitude,
  });
  const secondaryRepairPlan = buildRepairPlan({
    checkpoints: effectiveSecondaryGeographicCheckpoints,
    coverage: secondaryCoverage,
    includeWeak: true,
  });
  const secondaryCoverageByPass = summarizeCoverageByRing(
    effectiveSecondaryGeographicCheckpoints,
    secondaryCoverage,
  );

  const recordSecondaryObservation = (
    checkpointId: string,
    capturedAtMs: number,
    quality?: ImageQualityAssessment,
  ) => {
    const checkpoint = effectiveSecondaryGeographicCheckpoints.find(
      (point) => point.id === checkpointId,
    );
    if (!checkpoint) return;
    const useLiveAircraft =
      telemetryMode === "aircraft" &&
      aircraftTelemetry &&
      !relativeAircraftTelemetry?.stale;
    const observation: CaptureObservation = {
      id: `pattern-${checkpoint.id}-${capturedAtMs}`,
      checkpointId: checkpoint.id,
      capturedAtMs,
      latitude: useLiveAircraft ? aircraftTelemetry.latitude : checkpoint.latitude,
      longitude: useLiveAircraft ? aircraftTelemetry.longitude : checkpoint.longitude,
      relativeAltitudeFt: useLiveAircraft
        ? aircraftTelemetry.relativeAltitudeFt
        : checkpoint.relativeAltitudeFt,
      cameraAngle: useLiveAircraft
        ? aircraftTelemetry.gimbalPitchDeg
        : checkpoint.cameraAngle,
      sharpnessScore: quality?.sharpnessScore ?? 0.95,
      exposureScore: quality?.exposureScore ?? 0.95,
      usable: quality?.usable ?? true,
    };
    setSecondaryObservations((observations) => [
      ...observations.filter((item) => item.checkpointId !== checkpoint.id),
      observation,
    ]);
  };

  const markSecondaryCaptured = (capturedAtMs: number) => {
    if (!currentSecondaryCheckpoint) return;
    recordSecondaryObservation(currentSecondaryCheckpoint.id, capturedAtMs);
    setSecondaryIndex((index) =>
      Math.min(effectiveSecondaryGeographicCheckpoints.length - 1, index + 1),
    );
  };

  const analyzeSecondaryImage = async (file: File, capturedAtMs: number) => {
    if (!currentSecondaryCheckpoint) return;
    setSecondaryImageStatus("analyzing");
    setSecondaryImageMessage(null);
    try {
      const quality = await analyzeImageFile(file);
      recordSecondaryObservation(currentSecondaryCheckpoint.id, capturedAtMs, quality);
      setSecondaryImageStatus("done");
      setSecondaryImageMessage(
        quality.warnings.length
          ? quality.warnings.join(" ")
          : "Image quality meets the current DOMINIC capture policy.",
      );
    } catch (error) {
      setSecondaryImageStatus("error");
      setSecondaryImageMessage(
        error instanceof Error ? error.message : "Image analysis failed.",
      );
    }
  };

  const resetSecondaryCaptureQa = () => {
    setSecondaryIndex(0);
    setSecondaryObservations([]);
    setSecondaryImageStatus("idle");
    setSecondaryImageMessage(null);
  };

  const secondaryFlightPlanSignature = JSON.stringify({
    missionType,
    centerLatitude,
    centerLongitude,
    patternHeadingDeg,
    checkpoints: effectiveSecondaryGeographicCheckpoints.map((point) => [
      point.id,
      point.latitude,
      point.longitude,
      point.relativeAltitudeFt,
      point.cameraAngle,
    ]),
  });
  const secondaryFlightApproved =
    secondaryFlightApprovalSignature === secondaryFlightPlanSignature;

  const connectedAircraftFingerprint = bridgeInfo
    ? aircraftFingerprint({
        vendor: bridgeInfo.vendor,
        aircraftId: bridgeInfo.aircraftId,
        model: bridgeInfo.model,
      })
    : "";
  const activeValidationPlanSignature =
    missionType === "object"
      ? realFlightPlanSignature
      : secondaryFlightPlanSignature;
  const flightValidationStatus =
    flightValidation && connectedAircraftFingerprint
      ? validationStatus(flightValidation, {
          aircraftFingerprint: connectedAircraftFingerprint,
          planSignature: activeValidationPlanSignature,
        })
      : null;
  const productionFlightUnlocked =
    Boolean(benchReport?.readyForPropOnFieldTest) &&
    Boolean(flightValidationStatus?.productionUnlocked);

  const searchMapLocation = async () => {
    const query = mapSearch.trim();
    if (query.length < 3) {
      setMapAreaMessage("Enter a street address, city, business, or place name.");
      return;
    }
    setMapSearchBusy(true);
    setMapSearchResults([]);
    setMapAreaMessage("Searching for that location…");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as {
        results?: Array<{ latitude: number; longitude: number; label: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Location search failed.");
      const results = payload.results ?? [];
      setMapSearchResults(results);
      if (!results.length) {
        setMapAreaMessage("No matching location found. Try a more complete street address.");
        return;
      }
      if (results.length === 1) {
        const result = results[0];
        setCenterLatitude(result.latitude);
        setCenterLongitude(result.longitude);
        setHomeLatitude(result.latitude);
        setHomeLongitude(result.longitude);
        setMapLocationLabel(result.label);
        setMapFocusRevision((value) => value + 1);
        setMapAreaPoints([]);
        setMapAreaDefined(false);
        setMapDrawing(false);
        setWaypointOverrides({});
        setSelectedWaypointId(null);
        if (planName === "Untitled Capture Plan") {
          setPlanName(`${missionProfiles[missionType === "object" || missionType === "interior" ? "roof" : missionType].label} · ${result.label.split(",")[0]}`);
        }
        setMapAreaMessage(`Location set: ${result.label}. Move/zoom the map if needed, then choose Define Mapping Area.`);
      } else {
        setMapAreaMessage("Choose the correct location from the search results.");
      }
    } catch (error) {
      setMapAreaMessage(error instanceof Error ? error.message : "Location search failed.");
    } finally {
      setMapSearchBusy(false);
    }
  };

  const selectMapSearchResult = (result: { latitude: number; longitude: number; label: string }) => {
    setCenterLatitude(result.latitude);
    setCenterLongitude(result.longitude);
    setHomeLatitude(result.latitude);
    setHomeLongitude(result.longitude);
    setMapLocationLabel(result.label);
    setMapFocusRevision((value) => value + 1);
    setMapSearch(result.label);
    setMapSearchResults([]);
    setMapAreaPoints([]);
    setMapAreaDefined(false);
    setMapDrawing(false);
    setWaypointOverrides({});
    setSelectedWaypointId(null);
    if (planName === "Untitled Capture Plan") {
      setPlanName(`${missionProfiles[missionType === "object" || missionType === "interior" ? "roof" : missionType].label} · ${result.label.split(",")[0]}`);
    }
    setMapAreaMessage(`Location set: ${result.label}. Move/zoom the map if needed, then choose Define Mapping Area.`);
  };

  const choosePlanningSource = (source: "map" | "live" | "local") => {
    setPlanningSource(source);
    setMapAreaPoints([]);
    setMapDrawing(false);
    setWaypointOverrides({});
    setSelectedWaypointId(null);
    if (source === "local") {
      setMissionType("object");
    } else if (source === "map" && (missionType === "object" || missionType === "interior")) {
      setMissionType("roof");
    }
  };

  const resetWaypointEdits = () => {
    setWaypointOverrides({});
    setSelectedWaypointId(null);
    setRealFlightApprovalSignature(null);
    setSecondaryFlightApprovalSignature(null);
    setMapAreaMessage("Manual waypoint edits reset to DOMINIC's generated route.");
  };

  const startMapAreaDrawing = () => {
    if (!mapLocationLabel) {
      setMapAreaMessage("Search for the site address or place first so DOMINIC owns the correct map center.");
      return;
    }
    if (missionType === "object" || missionType === "interior") {
      setMissionType("roof");
      setMapAreaMessage("Roof selected. Click each corner of the area you want DOMINIC to map.");
    } else {
      setMapAreaMessage("Click each corner of the area you want DOMINIC to map, then choose Finish Area.");
    }
    setMapAreaPoints([]);
    setMapAreaDefined(false);
    setWaypointOverrides({});
    setSelectedWaypointId(null);
    setMapDrawing(true);
  };

  const finishMapAreaDrawing = () => {
    if (mapAreaPoints.length < 3) {
      setMapAreaMessage("Add at least 3 points before finishing the mapping area.");
      return;
    }

    const centerLat =
      mapAreaPoints.reduce((sum, point) => sum + point.latitude, 0) / mapAreaPoints.length;
    const centerLon =
      mapAreaPoints.reduce((sum, point) => sum + point.longitude, 0) / mapAreaPoints.length;

    const first = mapAreaPoints[0];
    const second = mapAreaPoints[1];
    const firstEdge = bearingAndDistanceBetween({
      fromLatitude: first.latitude,
      fromLongitude: first.longitude,
      toLatitude: second.latitude,
      toLongitude: second.longitude,
    });
    const headingDeg = firstEdge.bearingDeg;
    const headingRad = (headingDeg * Math.PI) / 180;

    const localPoints = mapAreaPoints.map((point) => {
      const relative = bearingAndDistanceBetween({
        fromLatitude: centerLat,
        fromLongitude: centerLon,
        toLatitude: point.latitude,
        toLongitude: point.longitude,
      });
      const bearingRad = (relative.bearingDeg * Math.PI) / 180;
      const north = Math.cos(bearingRad) * relative.distanceFt;
      const east = Math.sin(bearingRad) * relative.distanceFt;
      return {
        along: north * Math.cos(headingRad) + east * Math.sin(headingRad),
        across: -north * Math.sin(headingRad) + east * Math.cos(headingRad),
      };
    });

    const alongValues = localPoints.map((point) => point.along);
    const acrossValues = localPoints.map((point) => point.across);
    const lengthFt = Math.max(4, Math.max(...alongValues) - Math.min(...alongValues));
    const widthFt = Math.max(4, Math.max(...acrossValues) - Math.min(...acrossValues));

    setCenterLatitude(centerLat);
    setCenterLongitude(centerLon);
    setPatternLengthFt(Number(lengthFt.toFixed(1)));
    setPatternWidthFt(Number(widthFt.toFixed(1)));
    setPatternHeadingDeg(Number(headingDeg.toFixed(1)));
    setMapLocationLabel((label) => label ?? "Selected mapping area");
    setMapDrawing(false);
    setMapAreaDefined(true);
    setMapAreaMessage(
      `Area defined · ${lengthFt.toFixed(0)} × ${widthFt.toFixed(0)} ft · ${mapAreaPoints.length} boundary points. DOMINIC regenerated the ${missionProfiles[missionType === "object" || missionType === "interior" ? "roof" : missionType].label} route.`,
    );
  };

  const activeProfile = missionProfiles[missionType];

  const activeSimpleCheckpoints =
    missionType === "object" ? geographicCheckpoints : effectiveSecondaryGeographicCheckpoints;
  const activeSimplePlan =
    missionType === "object"
      ? {
          checkpointCount: geographicCheckpoints.length,
          estimatedMinutes: plan.estimatedMinutes,
          passCount: plan.rings.length,
        }
      : {
          checkpointCount: effectiveSecondaryGeographicCheckpoints.length,
          estimatedMinutes: secondaryPlan?.estimatedMinutes ?? 0,
          passCount: secondaryPlan?.passCount ?? 0,
        };

  const exportDjiMissionPackage = () => {
    if (!activeSimpleCheckpoints.length) {
      setPlanPersistenceStatus("Generate a route before exporting the DJI mission package.");
      return;
    }
    const mission = buildDominicDjiMissionPackage({
      name: planName,
      missionType,
      centerLatitude,
      centerLongitude,
      cruiseSpeedMps: 5,
      checkpoints: activeSimpleCheckpoints,
    });
    downloadDominicDjiMissionPackage(mission);
    setPlanPersistenceStatus("DJI handoff package exported. The DOMINIC Android host can convert it to a DJI KMZ.");
  };

  return (
    <div style={{ minHeight: 650, background: V.bg, color: V.text }}>
      <div style={{ padding: "18px 18px 12px", borderBottom: `1px solid ${V.line}`, display: showAdvancedPlanner ? "flex" : "none", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: V.orange, fontSize: 11, fontWeight: 900, letterSpacing: ".13em", textTransform: "uppercase" }}>
            <Crosshair size={16} /> DOMINIC Capture Planner
          </div>
          <h1 style={{ margin: "6px 0 4px", fontSize: 23, lineHeight: 1.1 }}>Plan the capture before you fly it.</h1>
          <p style={{ margin: 0, color: V.muted, maxWidth: 720, fontSize: 12, lineHeight: 1.55 }}>
            Manual-flight guidance now. The same capture checkpoints are structured so they can become autonomous DJI waypoints later.
          </p>
        </div>
        <div style={{ minWidth: 250, border: `1px solid ${V.line}`, background: V.panel, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ color: V.muted, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase" }}>Planning engine</div>
          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800 }}>
            <CheckCircle2 size={15} color={V.green} /> Manual capture guidance active
          </div>
          <div style={{ color: V.muted, fontSize: 10, marginTop: 4 }}>Checkpoint model designed for future DJI mission export.</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 6, marginTop: 10 }}>
            <input
              aria-label="Capture plan name"
              value={planName}
              onChange={(event) => setPlanName(event.target.value)}
              style={{ minWidth: 0, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 9 }}
            />
            <button
              type="button"
              onClick={() => void saveCapturePlan()}
              disabled={planPersistenceBusy}
              style={{ border: `1px solid rgba(244,90,30,.35)`, background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 7, padding: "7px 8px", fontSize: 9, fontWeight: 900, cursor: planPersistenceBusy ? "wait" : "pointer", display: "inline-flex", gap: 5, alignItems: "center" }}
            >
              <Save size={11} /> {activeSavedPlanId ? "Update" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSavedPlanId(null);
                setPlanName("Untitled Capture Plan");
                setMapAreaPoints([]);
                setMapAreaDefined(false);
                setMapDrawing(false);
                setWaypointOverrides({});
                setSelectedWaypointId(null);
                setPlanPersistenceStatus("New unsaved plan.");
                setReviewPreflightRan(false);
                setReviewFlightConfirmed(false);
                setPlannerView("plan");
              }}
              style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 9, fontWeight: 800, cursor: "pointer" }}
            >
              New
            </button>
          </div>
          {savedPlans.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 6, marginTop: 6 }}>
              <select
                aria-label="Saved capture plans"
                value={activeSavedPlanId ?? ""}
                onChange={(event) => setActiveSavedPlanId(event.target.value || null)}
                style={{ minWidth: 0, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 9 }}
              >
                <option value="">Saved plans…</option>
                {savedPlans.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name} · {missionProfiles[saved.mission_type]?.label ?? saved.mission_type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!activeSavedPlanId}
                onClick={() => {
                  const saved = savedPlans.find((item) => item.id === activeSavedPlanId);
                  if (saved) openCapturePlan(saved);
                }}
                style={{ border: `1px solid ${V.line}`, background: V.panel2, color: activeSavedPlanId ? V.green : V.muted, borderRadius: 7, padding: "7px 8px", fontSize: 9, fontWeight: 900, cursor: activeSavedPlanId ? "pointer" : "not-allowed", display: "inline-flex", gap: 5, alignItems: "center" }}
              >
                <FolderOpen size={11} /> Open
              </button>
            </div>
          ) : null}
          {planPersistenceStatus ? <div style={{ color: V.muted, fontSize: 8, marginTop: 6, lineHeight: 1.35 }}>{planPersistenceStatus}</div> : null}
        </div>
      </div>

      {inspectionContext ? (
        <section style={{ margin: "14px 14px 0", border: `1px solid ${inspectionEquipmentReady ? "rgba(112,214,160,.38)" : "rgba(255,184,107,.42)"}`, borderRadius: 12, background: inspectionEquipmentReady ? "rgba(112,214,160,.06)" : "rgba(255,184,107,.06)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>Asset inspection</div>
              <div style={{ color: V.text, fontSize: 17, fontWeight: 900, marginTop: 3 }}>
                {inspectionContext.assetName} · {inspectionContext.inspectionType.replaceAll("_", " ")}
              </div>
              <div style={{ color: V.muted, fontSize: 9, lineHeight: 1.45, marginTop: 4 }}>
                {inspectionContext.objective ?? "No inspection objective recorded."}
              </div>
            </div>
            <div style={{ minWidth: 230, textAlign: "right" }}>
              <div style={{ color: inspectionEquipmentReady ? V.green : V.amber, fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>
                {inspectionEquipmentReady ? "Equipment compatible" : "Equipment not execution-ready"}
              </div>
              <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>
                {inspectionContext.equipment
                  ? `${[inspectionContext.equipment.manufacturer, inspectionContext.equipment.model, inspectionContext.equipment.displayName].filter(Boolean).join(" · ") || "Assigned aircraft"}${inspectionEquipmentReady ? "" : ` · missing ${inspectionContext.equipment.missingRequired.join(", ")}`}`
                  : "No aircraft assigned to this inspection."}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${inspectionWatchEnabled ? "rgba(112,214,160,.38)" : V.line}`,
              borderRadius: 9,
              background: inspectionWatchEnabled ? "rgba(112,214,160,.055)" : "#0D1319",
              padding: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: inspectionWatchEnabled ? V.green : V.text, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Inspection Watch
                </div>
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 3, maxWidth: 720 }}>
                  While you fly manually, DOMINIC can periodically capture full-resolution still evidence, save it to this asset inspection, screen it, and surface candidate anomalies. This is sampled live inspection, not continuous video-frame inference.
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  aria-label="Inspection Watch sampling interval"
                  value={inspectionWatchIntervalSec}
                  disabled={inspectionWatchEnabled}
                  onChange={(event) => setInspectionWatchIntervalSec(normalizeInspectionWatchInterval(Number(event.target.value)))}
                  style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8 }}
                >
                  <option value={10}>Every 10 sec</option>
                  <option value={15}>Every 15 sec</option>
                  <option value={30}>Every 30 sec</option>
                  <option value={60}>Every 60 sec</option>
                </select>
                <button
                  type="button"
                  disabled={
                    !inspectionWatchEnabled &&
                    (!inspectionContext ||
                      !inspectionEquipmentReady ||
                      bridgeStatus !== "connected" ||
                      !bridgeInfo?.capabilities.photoCapture)
                  }
                  onClick={() => {
                    if (inspectionWatchEnabled) {
                      setInspectionWatchEnabled(false);
                      inspectionWatchCapturePendingRef.current = false;
                      setAutomaticMediaStatus("Inspection Watch stopped.");
                      return;
                    }
                    inspectionWatchLastRequestedAtRef.current = 0;
                    inspectionWatchCapturePendingRef.current = false;
                    setInspectionWatchCaptureCount(0);
                    setInspectionWatchEnabled(true);
                    setAutomaticMediaStatus(
                      `Inspection Watch started · sampling every ${normalizeInspectionWatchInterval(inspectionWatchIntervalSec)} seconds while the camera bridge remains connected.`,
                    );
                  }}
                  style={{
                    border: `1px solid ${inspectionWatchEnabled ? "rgba(255,184,107,.42)" : "rgba(112,214,160,.38)"}`,
                    background: inspectionWatchEnabled ? "rgba(255,184,107,.09)" : "rgba(112,214,160,.09)",
                    color: inspectionWatchEnabled ? V.amber : V.green,
                    borderRadius: 7,
                    padding: "7px 10px",
                    fontSize: 8,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {inspectionWatchEnabled ? "Stop Watch" : "Start Watch"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 7, color: V.muted, fontSize: 8 }}>
              <span>{inspectionWatchEnabled ? "ACTIVE" : "STOPPED"}</span>
              <span>Samples requested: {inspectionWatchCaptureCount}</span>
              <span>{inspectionWatchReasonLabel(watchReadiness.reason)}</span>
            </div>
          </div>

          {inspectionContext.followUpCapture ? (
            <div
              style={{
                marginTop: 10,
                border: `1px solid rgba(244,90,30,.38)`,
                borderRadius: 9,
                background: "rgba(244,90,30,.075)",
                padding: 10,
              }}
            >
              <div style={{ color: "#FFD3C0", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Follow-up capture task
              </div>
              <div style={{ color: V.text, fontSize: 12, fontWeight: 900, marginTop: 3 }}>
                {inspectionContext.followUpCapture.findingTitle}
              </div>
              <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>
                Target framing: about {inspectionContext.followUpCapture.estimatedOpticalZoomMultiplier.toFixed(1)}x tighter than the source evidence.
                {inspectionContext.targetLocation
                  ? ` Target: ${inspectionContext.targetLocation.latitude.toFixed(6)}, ${inspectionContext.targetLocation.longitude.toFixed(6)}.`
                  : " Re-center the marked image region before capture."}
              </div>
              {inspectionContext.followUpCapture.reasons.length ? (
                <div style={{ color: V.amber, fontSize: 8, lineHeight: 1.45, marginTop: 5 }}>
                  {inspectionContext.followUpCapture.reasons.join(" ")}
                </div>
              ) : null}
              {inspectionContext.followUpCapture.guidance.length ? (
                <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                  {inspectionContext.followUpCapture.guidance.map((line, index) => (
                    <div key={index} style={{ color: V.muted, fontSize: 8, lineHeight: 1.4 }}>
                      {index + 1}. {line}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section style={{ margin: "14px 14px 0", border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 12, display: plannerView === "plan" ? "block" : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: V.text, fontSize: 18, fontWeight: 900 }}>Create a capture plan</div>
            <div style={{ color: V.muted, fontSize: 9, marginTop: 3 }}>
              Choose how you want to plan the mission. DOMINIC handles the route calculations.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedPlanner((value) => !value)}
            style={{ border: `1px solid ${V.line}`, background: showAdvancedPlanner ? "rgba(244,90,30,.12)" : "#0D1319", color: showAdvancedPlanner ? "#FFD3C0" : V.muted, borderRadius: 8, padding: "7px 10px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
          >
            {showAdvancedPlanner ? "Hide Advanced Settings" : "Advanced Settings"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, marginTop: 10 }}>
          {([
            ["map", "Map / Satellite", "Find a property and draw the area."],
            ["live", "Live Drone", "Plan from what the drone sees now."],
            ["local", "Local Object", "Chair, machine, vehicle or indoor object."],
          ] as const).map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => choosePlanningSource(value)}
              style={{ border: planningSource === value ? `1px solid ${V.orange}` : `1px solid ${V.line}`, background: planningSource === value ? "rgba(244,90,30,.12)" : "#0D1319", color: V.text, borderRadius: 9, padding: "9px 10px", textAlign: "left", cursor: "pointer" }}
            >
              <div style={{ fontSize: 10, fontWeight: 900 }}>{label}</div>
              <div style={{ color: V.muted, fontSize: 8, marginTop: 3, lineHeight: 1.35 }}>{description}</div>
            </button>
          ))}
        </div>
      </section>

      {inspectionContext && liveInspectionFindings.some((finding) => finding.review_status === "needs_review") ? (
        <section style={{ margin: "10px 14px 0", border: `1px solid rgba(255,184,107,.38)`, borderRadius: 12, background: "rgba(255,184,107,.055)", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,184,107,.22)`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: V.amber, fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>
                Live Inspection Intelligence
              </div>
              <div style={{ color: V.text, fontSize: 13, fontWeight: 900, marginTop: 3 }}>
                DOMINIC found something that needs a human look.
              </div>
              <div style={{ color: V.muted, fontSize: 8, marginTop: 3 }}>
                {inspectionContext.assetName} · candidates are visual screening only until you confirm them.
              </div>
            </div>
            <div style={{ color: V.amber, fontSize: 9, fontWeight: 900 }}>
              {liveInspectionFindings.filter((finding) => finding.review_status === "needs_review").length} NEED REVIEW
            </div>
          </div>
          <div style={{ display: "grid", gap: 7, padding: 10 }}>
            {liveInspectionFindings
              .filter((finding) => finding.review_status === "needs_review")
              .map((finding) => (
                <div key={finding.id} style={{ border: `1px solid ${V.line}`, borderRadius: 9, background: V.panel, padding: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                    <div>
                      <div style={{ color: V.text, fontSize: 10, fontWeight: 900 }}>{finding.title}</div>
                      {finding.description ? (
                        <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 3 }}>{finding.description}</div>
                      ) : null}
                      <div style={{ color: V.muted, fontSize: 7, marginTop: 5 }}>
                        {finding.finding_type.replaceAll("_", " ")}
                        {finding.sensor_mode ? ` · ${finding.sensor_mode.toUpperCase()}` : ""}
                        {finding.confidence !== null ? ` · ${Math.round(finding.confidence * 100)}% model confidence` : ""}
                      </div>
                    </div>
                    <span style={{ color: finding.severity === "high" || finding.severity === "critical" ? "#FF9A86" : finding.severity === "medium" ? V.amber : V.green, fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>
                      {finding.severity}
                    </span>
                  </div>
                  {followUpFindingId === finding.id ? (
                    <div style={{ marginTop: 7, border: `1px solid rgba(244,90,30,.28)`, borderRadius: 7, background: "rgba(244,90,30,.07)", color: "#FFD3C0", padding: "7px 8px", fontSize: 8, lineHeight: 1.4 }}>
                      Follow-up requested: capture a closer or alternate-angle RGB/zoom image of this same visible condition while you are still on site. DOMINIC will screen the new evidence automatically.
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={liveFindingReviewBusyId === finding.id}
                      onClick={() => void reviewLiveInspectionFinding(finding.id, "confirm")}
                      style={{ border: `1px solid rgba(112,214,160,.35)`, background: "rgba(112,214,160,.09)", color: V.green, borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: liveFindingReviewBusyId === finding.id ? "wait" : "pointer" }}
                    >
                      Confirm Issue
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowUpFindingId((current) => current === finding.id ? null : finding.id)}
                      style={{ border: `1px solid rgba(244,90,30,.35)`, background: "rgba(244,90,30,.08)", color: "#FFD3C0", borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      {followUpFindingId === finding.id ? "Cancel Follow-up" : "Capture Another View"}
                    </button>
                    <button
                      type="button"
                      disabled={liveFindingReviewBusyId === finding.id}
                      onClick={() => void reviewLiveInspectionFinding(finding.id, "dismiss")}
                      style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.muted, borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: liveFindingReviewBusyId === finding.id ? "wait" : "pointer" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section style={{ margin: "10px 14px 0", border: `1px solid ${V.line}`, borderRadius: 12, background: "#0D1319", overflow: "hidden", display: plannerView === "plan" ? "block" : "none" }}>
        {planningSource === "map" ? (
          <div>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${V.line}`, background: V.panel }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 7 }}>
                <input
                  aria-label="Search address or place"
                  value={mapSearch}
                  onChange={(event) => setMapSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchMapLocation();
                  }}
                  placeholder="Enter address, e.g. 123 Main St, Linwood, PA"
                  style={{ minWidth: 0, border: `1px solid ${V.line}`, background: "#0B1117", color: V.text, borderRadius: 8, padding: "9px 10px", fontSize: 10, outline: 0 }}
                />
                <button
                  type="button"
                  onClick={() => void searchMapLocation()}
                  disabled={mapSearchBusy}
                  style={{ border: `1px solid rgba(244,90,30,.45)`, background: "rgba(244,90,30,.13)", color: "#FFD3C0", borderRadius: 8, padding: "9px 12px", fontSize: 9, fontWeight: 900, cursor: mapSearchBusy ? "wait" : "pointer" }}
                >
                  {mapSearchBusy ? "Searching…" : "Find location"}
                </button>
              </div>
              {mapSearchResults.length > 1 ? (
                <div style={{ display: "grid", gap: 5, marginTop: 7 }}>
                  {mapSearchResults.map((result, index) => (
                    <button
                      key={`${result.latitude}-${result.longitude}-${index}`}
                      type="button"
                      onClick={() => selectMapSearchResult(result)}
                      style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", textAlign: "left", fontSize: 8, lineHeight: 1.35, cursor: "pointer" }}
                    >
                      {result.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div style={{ color: mapLocationLabel ? V.green : V.muted, fontSize: 8, marginTop: 6, lineHeight: 1.4 }}>
                {mapLocationLabel ? `Planning location: ${mapLocationLabel}` : "Search first. DOMINIC uses this location as the authoritative map center so the plan cannot jump back to an old default."}
              </div>
            </div>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: V.orange, fontSize: 9, fontWeight: 900 }}>MAP PLAN</div>
                <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>Search, outline the subject, and review the route.</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  aria-label="Map mission type"
                  value={missionType === "object" || missionType === "interior" ? "roof" : missionType}
                  onChange={(event) => { setMissionType(event.target.value as CaptureMissionType); setWaypointOverrides({}); setSelectedWaypointId(null); }}
                  style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 7, padding: "7px 9px", fontSize: 8, fontWeight: 900 }}
                >
                  <option value="roof">Roof</option>
                  <option value="building">Building / 3D Structure</option>
                  <option value="stockpile">Stockpile</option>
                  <option value="corridor">Corridor</option>
                  <option value="facade">Facade</option>
                </select>
                {!mapDrawing ? (
                  <>
                    <button
                      type="button"
                      onClick={startMapAreaDrawing}
                      disabled={!mapLocationLabel}
                      style={{ border: `1px solid rgba(244,90,30,.55)`, background: mapLocationLabel ? "rgba(244,90,30,.16)" : "#20272E", color: mapLocationLabel ? "#FFD3C0" : V.muted, borderRadius: 7, padding: "7px 10px", fontSize: 8, fontWeight: 900, cursor: mapLocationLabel ? "pointer" : "not-allowed" }}
                    >
                      {mapAreaDefined ? "Redraw Mapping Area" : "Define Mapping Area"}
                    </button>
                    {mapAreaDefined ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMapAreaPoints([]);
                          setMapAreaDefined(false);
                          setMapDrawing(false);
                          setMapAreaMessage("Plan cleared. Move/zoom the map, then define a new mapping area.");
                        }}
                        style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 7, padding: "7px 9px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                      >
                        Move Map / Clear Plan
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={mapAreaPoints.length < 3}
                      onClick={finishMapAreaDrawing}
                      style={{ border: `1px solid rgba(112,214,160,.45)`, background: "rgba(112,214,160,.10)", color: mapAreaPoints.length >= 3 ? V.green : V.muted, borderRadius: 7, padding: "7px 10px", fontSize: 8, fontWeight: 900, cursor: mapAreaPoints.length >= 3 ? "pointer" : "not-allowed" }}
                    >
                      Finish Area ({mapAreaPoints.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMapAreaPoints([]);
                        setMapAreaDefined(false);
                        setMapDrawing(false);
                        setMapAreaMessage("Mapping area cleared. Move/zoom the map or define a new area.");
                      }}
                      style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 7, padding: "7px 9px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={!aircraftTelemetry}
                  onClick={() => {
                    if (!aircraftTelemetry) return;
                    setCenterLatitude(aircraftTelemetry.latitude);
                    setCenterLongitude(aircraftTelemetry.longitude);
                    setHomeLatitude(aircraftTelemetry.latitude);
                    setHomeLongitude(aircraftTelemetry.longitude);
                    setMapLocationLabel("Connected aircraft location");
                    setMapFocusRevision((value) => value + 1);
                    setMapAreaPoints([]);
                    setMapAreaDefined(false);
                    setWaypointOverrides({});
                    setSelectedWaypointId(null);
                    setMapAreaMessage("Map centered on the connected aircraft. Pan/zoom if needed, then define the mapping area.");
                  }}
                  style={{ border: `1px solid ${V.line}`, background: V.panel2, color: aircraftTelemetry ? V.green : V.muted, borderRadius: 7, padding: "7px 9px", fontSize: 8, fontWeight: 900, cursor: aircraftTelemetry ? "pointer" : "not-allowed" }}
                >
                  Use aircraft location
                </button>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <CapturePlanningMap
                key={mapFocusRevision}
                focusLatitude={centerLatitude}
                focusLongitude={centerLongitude}
                drawing={mapDrawing}
                boundary={mapAreaPoints}
                route={activeSimpleCheckpoints}
                routeVisible={mapAreaDefined && !mapDrawing}
                selectedWaypointId={selectedWaypointId}
                onBoundaryPoint={(point) => {
                  setMapAreaPoints((points) => [...points, point]);
                  setMapAreaMessage("Keep clicking around the boundary. Choose Finish Area when the subject is enclosed.");
                }}
                onWaypointSelect={setSelectedWaypointId}
                onWaypointMove={(id, latitude, longitude) => {
                  setWaypointOverrides((current) => ({
                    ...current,
                    [id]: { latitude, longitude },
                  }));
                  setSelectedWaypointId(id);
                  setSecondaryFlightApprovalSignature(null);
                  setMapAreaMessage("Waypoint adjusted. Review the route and save the updated plan.");
                }}
              />
              <div style={{ position: "absolute", left: 10, top: 10, zIndex: 20, maxWidth: 520, background: mapDrawing ? "rgba(60,22,8,.94)" : "rgba(11,17,23,.9)", border: `1px solid ${mapDrawing ? "rgba(244,90,30,.55)" : V.line}`, color: mapDrawing ? "#FFD3C0" : "#DCE3EA", borderRadius: 8, padding: "8px 10px", fontSize: 9, lineHeight: 1.45, pointerEvents: "none" }}>
                {mapDrawing ? <strong>DRAWING AREA · </strong> : null}{mapAreaMessage}
              </div>
              <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 20, background: "rgba(11,17,23,.88)", border: `1px solid ${V.line}`, borderRadius: 8, padding: "7px 9px", color: "#DCE3EA", fontSize: 9, pointerEvents: "none" }}>
                {mapAreaDefined ? `${activeSimplePlan.checkpointCount} checkpoints · ${activeSimplePlan.passCount} passes · ~${activeSimplePlan.estimatedMinutes} min` : "Pan/zoom freely, then define the mapping area"}
              </div>
            </div>
            {mapAreaDefined && !mapDrawing ? (
              <div style={{ borderTop: `1px solid ${V.line}`, background: V.panel, padding: "10px 12px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ color: V.green, fontSize: 9, fontWeight: 900 }}>PLAN READY</div>
                  <div style={{ color: V.text, fontSize: 11, fontWeight: 800, marginTop: 2 }}>
                    {missionProfiles[missionType].label} · {activeSimplePlan.checkpointCount} capture points · ~{activeSimplePlan.estimatedMinutes} min
                  </div>
                  <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>
                    {patternLengthFt.toFixed(0)} × {patternWidthFt.toFixed(0)} ft · {patternAltitudeFt.toFixed(0)} ft altitude · {patternOverlapPct}% overlap{Object.keys(waypointOverrides).length ? ` · ${Object.keys(waypointOverrides).length} waypoint edit(s)` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ color: V.muted, fontSize: 8 }}>Drag any white waypoint to fine-tune the route.</span>
                  {Object.keys(waypointOverrides).length ? (
                    <button type="button" onClick={resetWaypointEdits} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.amber, borderRadius: 8, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}>
                      Reset Waypoints
                    </button>
                  ) : null}
                  <button type="button" onClick={startMapAreaDrawing} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 8, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}>
                    Redraw Area
                  </button>
                  <button type="button" onClick={() => void saveCapturePlan()} disabled={planPersistenceBusy} style={{ border: 0, background: V.orange, color: "#160901", borderRadius: 8, padding: "8px 13px", fontSize: 9, fontWeight: 900, cursor: planPersistenceBusy ? "wait" : "pointer" }}>
                    {planPersistenceBusy ? "Saving…" : "Save Plan"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : planningSource === "live" ? (
          <div style={{ minHeight: 420, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
            <div style={{ maxWidth: 620 }}>
              <Radio size={34} color={bridgeStatus === "connected" ? V.green : V.orange} />
              <div style={{ color: V.text, fontSize: 18, fontWeight: 900, marginTop: 10 }}>Live Drone View</div>
              <div style={{ color: V.muted, fontSize: 10, lineHeight: 1.6, marginTop: 6 }}>
                {bridgeStatus === "connected"
                  ? "The aircraft telemetry bridge is connected. Camera-video transport is the remaining piece before DOMINIC can let you outline the subject directly on the live image."
                  : "Connect the DJI bridge first. DOMINIC will use the aircraft camera plus telemetry to let you outline a current stockpile, construction area, roof, vehicle or other subject."}
              </div>
              <div style={{ marginTop: 12, border: `1px solid ${bridgeStatus === "connected" ? "rgba(112,214,160,.25)" : "rgba(255,184,107,.25)"}`, background: V.panel, borderRadius: 9, padding: 10, color: bridgeStatus === "connected" ? V.green : V.amber, fontSize: 9, fontWeight: 900 }}>
                {bridgeStatus === "connected" ? "Telemetry connected · video feed not yet available" : "Aircraft not connected"}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: V.orange, fontSize: 9, fontWeight: 900 }}>LOCAL OBJECT WORKSPACE</div>
                <div style={{ color: V.text, fontSize: 17, fontWeight: 900, marginTop: 3 }}>No map required.</div>
                <div style={{ color: V.muted, fontSize: 9, lineHeight: 1.5, marginTop: 4 }}>Use this for chairs, machinery, vehicles, equipment and indoor objects. The subject is treated as the local origin and DOMINIC builds the capture path around it.</div>
              </div>
              {missionType !== "object" ? (
                <button type="button" onClick={() => setMissionType("object")} style={{ border: `1px solid rgba(244,90,30,.35)`, background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 8, padding: "8px 10px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>Switch to Object Scan</button>
              ) : null}
            </div>
            {missionType === "object" ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.8fr) minmax(320px,1.2fr)", gap: 14, marginTop: 14 }}>
                <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: V.panel, padding: 12 }}>
                  <div style={{ color: V.text, fontSize: 11, fontWeight: 900 }}>Object size & capture quality</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
                    <Field label="Width / diameter" value={objectDiameterFt} min={1} max={1000} suffix="ft" onChange={setObjectDiameterFt} />
                    <Field label="Height" value={objectHeightFt} min={1} max={1000} suffix="ft" onChange={setObjectHeightFt} />
                    <Field label="Stand-off" value={standoffFt} min={2} max={500} suffix="ft" onChange={setStandoffFt} />
                    <Field label="Overlap" value={overlapPct} min={40} max={95} suffix="%" onChange={setOverlapPct} />
                  </div>
                  <div style={{ marginTop: 10, color: V.green, fontSize: 9, fontWeight: 900 }}>{geographicCheckpoints.length} capture positions generated</div>
                </div>
                <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#090D12", minHeight: 300, display: "grid", placeItems: "center", padding: 12 }}>
                  <svg viewBox="0 0 100 100" style={{ width: "100%", maxHeight: 330 }} role="img" aria-label="Local object capture path">
                    <circle cx="50" cy="50" r="5" fill="rgba(244,90,30,.16)" stroke={V.orange} strokeWidth=".7" />
                    {plan.rings.map((ring, ringIndex) => {
                      const radius = 22 + ringIndex * 11;
                      return <circle key={ring.label} cx="50" cy="50" r={radius} fill="none" stroke={ringIndex === 1 ? V.orange : "rgba(245,247,250,.45)"} strokeWidth=".6" strokeDasharray={ringIndex === 1 ? "0" : "2 2"} />;
                    })}
                    {sequence.map((shot, index) => {
                      const ringIndex = Math.max(0, plan.rings.findIndex((ring) => ring.label === shot.ringLabel));
                      const p = polarPoint(shot.bearingDeg, 22 + ringIndex * 11);
                      return <circle key={shot.id} cx={p.x} cy={p.y} r={index === currentIndex ? 1.35 : .7} fill={index === currentIndex ? V.green : "#FFF"} stroke={V.orange} strokeWidth=".25" />;
                    })}
                  </svg>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {plannerView === "review" ? (
        <section style={{ margin: "14px", border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: V.green, fontSize: 9, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Saved plan</div>
              <div style={{ color: V.text, fontSize: 20, fontWeight: 900, marginTop: 3 }}>{planName}</div>
              <div style={{ color: V.muted, fontSize: 9, marginTop: 4 }}>Review the mission, connect the aircraft, run preflight, then export or fly when control is unlocked.</div>
            </div>
            <button
              type="button"
              onClick={() => { setReviewPreflightRan(false); setReviewFlightConfirmed(false); setPlannerView("plan"); }}
              style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 8, padding: "8px 11px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
            >
              Back to Edit Plan
            </button>
          </div>

          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(300px,.75fr)", gap: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", padding: 12 }}>
                <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Mission summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 10 }}>
                  {[
                    ["Mission", missionProfiles[missionType].label],
                    ["Capture points", String(activeSimplePlan.checkpointCount)],
                    ["Passes", String(activeSimplePlan.passCount)],
                    ["Estimated time", `~${activeSimplePlan.estimatedMinutes} min`],
                    ["Altitude", `${patternAltitudeFt.toFixed(0)} ft`],
                    ["Overlap", `${patternOverlapPct}%`],
                    ["Area", `${patternLengthFt.toFixed(0)} × ${patternWidthFt.toFixed(0)} ft`],
                    ["Waypoint edits", String(Object.keys(waypointOverrides).length)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: V.panel, padding: "8px 9px" }}>
                      <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
                      <div style={{ color: V.text, fontSize: 11, fontWeight: 900, marginTop: 3 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Aircraft</div>
                    <div style={{ color: V.text, fontSize: 13, fontWeight: 900, marginTop: 3 }}>
                      {bridgeStatus === "connected" ? `${bridgeInfo?.vendor?.toUpperCase() ?? "Aircraft"} ${bridgeInfo?.model ?? ""}`.trim() : "No aircraft connected"}
                    </div>
                    <div style={{ color: V.muted, fontSize: 8, marginTop: 3 }}>
                      {bridgeStatus === "connected"
                        ? `Flight Bridge connected · ${bridgeInfo?.aircraftId ?? "aircraft ID unavailable"}`
                        : "Connect the DJI controller/bridge to validate this plan against the real aircraft."}
                    </div>
                  </div>
                  {bridgeStatus === "connected" ? (
                    <button
                      type="button"
                      onClick={() => void disconnectAircraftBridge()}
                      style={{ border: `1px solid ${V.line}`, background: V.panel, color: V.text, borderRadius: 8, padding: "8px 10px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void connectAircraftBridge()}
                      disabled={bridgeStatus === "connecting"}
                      style={{ border: 0, background: V.orange, color: "#160901", borderRadius: 8, padding: "8px 12px", fontSize: 9, fontWeight: 900, cursor: bridgeStatus === "connecting" ? "wait" : "pointer" }}
                    >
                      {bridgeStatus === "connecting" ? "Connecting…" : "Connect Aircraft"}
                    </button>
                  )}
                </div>
                {bridgeStatus === "connected" && bridgeInfo?.capabilities.photoCapture ? (
                  <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => void captureConnectedInspectionPhoto()}
                      style={{ border: `1px solid rgba(112,214,160,.38)`, background: "rgba(112,214,160,.10)", color: V.green, borderRadius: 8, padding: "8px 10px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}
                    >
                      {inspectionContext?.followUpCapture ? "Capture Follow-Up Photo" : "Capture Inspection Photo"}
                    </button>
                    <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45 }}>
                      Camera-only inspection capture is available without enabling aircraft movement.
                      {inspectionContext ? ` Captures are saved to ${inspectionContext.assetName} inspection evidence automatically.` : ""}
                    </div>
                  </div>
                ) : null}
                {automaticMediaStatus ? (
                  <div style={{ color: automaticMediaStatus.includes("failed") || automaticMediaStatus.includes("rejected") ? "#FFB6AA" : V.muted, fontSize: 8, marginTop: 7, lineHeight: 1.45 }}>
                    {automaticMediaStatus}
                    {automaticMediaCount > 0 ? ` · ${automaticMediaCount} capture(s) received` : ""}
                  </div>
                ) : null}
                {bridgeError ? <div style={{ color: "#FFB6AA", fontSize: 8, marginTop: 7 }}>{bridgeError}</div> : null}
              </div>

              <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", padding: 12 }}>
                <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Preflight</div>
                <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
                  {[
                    ["Plan saved", Boolean(activeSavedPlanId), activeSavedPlanId ? "Saved mission record is available." : "Save the plan before flight."],
                    ["Route generated", activeSimplePlan.checkpointCount > 0, `${activeSimplePlan.checkpointCount} capture points in the active route.`],
                    ["Calibration", missionType === "object" ? preflightReady : secondaryCalibrationValidation.ready, missionType === "object" ? (preflightReady ? "Object-scan calibration is clear." : "Object-scan calibration requires attention.") : (secondaryCalibrationValidation.ready ? "Pattern calibration is clear." : "Pattern calibration requires attention.")],
                    ["Inspection equipment", inspectionEquipmentReady, inspectionEquipmentReady ? "Assigned inspection equipment satisfies the required sensor capabilities." : "The assigned aircraft/payload is missing a required inspection capability."],
                    ["Aircraft connected", bridgeStatus === "connected", bridgeStatus === "connected" ? "Live aircraft telemetry bridge is connected." : "Connect the aircraft before attempting flight."],
                    ["Control authority", productionFlightUnlocked, productionFlightUnlocked ? "DOMINIC connected-flight validation is unlocked." : "Connected flight remains locked until bench/simulation/controlled-field validation is complete."],
                  ].map(([label, ok, detail]) => (
                    <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 7, alignItems: "start", padding: "7px 8px", border: `1px solid ${V.line}`, borderRadius: 7, background: V.panel }}>
                      <div style={{ color: ok ? V.green : V.amber, fontWeight: 900 }}>{ok ? "✓" : "!"}</div>
                      <div>
                        <div style={{ color: V.text, fontSize: 9, fontWeight: 900 }}>{label}</div>
                        <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>{detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setReviewPreflightRan(true)}
                  style={{ width: "100%", marginTop: 9, border: `1px solid rgba(244,90,30,.35)`, background: "rgba(244,90,30,.10)", color: "#FFD3C0", borderRadius: 8, padding: "8px 10px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}
                >
                  Run Preflight Check
                </button>
                {reviewPreflightRan ? (
                  <div style={{ color: productionFlightUnlocked && bridgeStatus === "connected" && inspectionEquipmentReady ? V.green : V.amber, fontSize: 8, marginTop: 7, lineHeight: 1.45 }}>
                    {productionFlightUnlocked && bridgeStatus === "connected" && inspectionEquipmentReady
                      ? "Preflight review is clear for the current validated aircraft, inspection capabilities and plan."
                      : !inspectionEquipmentReady
                        ? "Plan review complete. Export remains available, but flight is blocked because the assigned inspection equipment is missing a required sensor capability."
                        : "Plan review complete. Export is available; connected autonomous flight remains locked until the aircraft validation ladder is complete."}
                  </div>
                ) : null}
              </div>
            </div>

            <aside style={{ display: "grid", gap: 10, alignContent: "start" }}>
              <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", padding: 12 }}>
                <div style={{ color: V.text, fontSize: 13, fontWeight: 900 }}>Next action</div>
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.5, marginTop: 4 }}>
                  The plan is saved. You can export it now, or connect the aircraft and complete preflight validation.
                </div>
                <button
                  type="button"
                  onClick={exportDjiMissionPackage}
                  style={{ width: "100%", marginTop: 10, border: `1px solid ${V.line}`, background: V.panel, color: V.text, borderRadius: 8, padding: "9px 10px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}
                >
                  Export Mission
                </button>
                <label style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr)", gap: 7, alignItems: "start", color: bridgeStatus === "connected" ? "#DCE3EA" : V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 9 }}>
                  <input
                    type="checkbox"
                    checked={reviewFlightConfirmed}
                    disabled={bridgeStatus !== "connected" || !productionFlightUnlocked || !inspectionEquipmentReady}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setReviewFlightConfirmed(checked);
                      if (missionType === "object") {
                        setRealFlightApprovalSignature(checked ? realFlightPlanSignature : null);
                      } else {
                        setSecondaryFlightApprovalSignature(checked ? secondaryFlightPlanSignature : null);
                      }
                    }}
                  />
                  <span>I confirm this route, aircraft, home/RTH point, airspace, people and obstacles are safe for execution.</span>
                </label>
                <button
                  type="button"
                  disabled={!productionFlightUnlocked || bridgeStatus !== "connected" || !reviewPreflightRan || !reviewFlightConfirmed || !inspectionEquipmentReady}
                  onClick={() => missionType === "object" ? void runConnectedAircraftMission("full") : void runSecondaryConnectedMission("full")}
                  style={{ width: "100%", marginTop: 7, border: `1px solid ${productionFlightUnlocked && bridgeStatus === "connected" && reviewPreflightRan && reviewFlightConfirmed && inspectionEquipmentReady ? "rgba(112,214,160,.38)" : V.line}`, background: productionFlightUnlocked && bridgeStatus === "connected" && reviewPreflightRan && reviewFlightConfirmed && inspectionEquipmentReady ? "rgba(112,214,160,.10)" : "#1B222A", color: productionFlightUnlocked && bridgeStatus === "connected" && reviewPreflightRan && reviewFlightConfirmed && inspectionEquipmentReady ? V.green : "#6F7A84", borderRadius: 8, padding: "9px 10px", fontSize: 9, fontWeight: 900, cursor: productionFlightUnlocked && bridgeStatus === "connected" && reviewPreflightRan && reviewFlightConfirmed && inspectionEquipmentReady ? "pointer" : "not-allowed" }}
                >
                  Fly Mission
                </button>
                {!inspectionEquipmentReady ? (
                  <div style={{ color: V.amber, fontSize: 8, lineHeight: 1.45, marginTop: 7 }}>
                    Flight is blocked for this inspection because the assigned aircraft/payload does not satisfy the required sensor capabilities.
                  </div>
                ) : !productionFlightUnlocked ? (
                  <div style={{ color: V.amber, fontSize: 8, lineHeight: 1.45, marginTop: 7 }}>
                    Flight is intentionally locked. The current DJI bridge is not yet cleared for autonomous aircraft control.
                  </div>
                ) : null}
              </div>

              <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: V.panel, padding: 12 }}>
                <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>Saved mission</div>
                <div style={{ color: V.text, fontSize: 10, fontWeight: 900, marginTop: 5 }}>{mapLocationLabel ?? "Local object / saved subject"}</div>
                {inspectionContext ? (
                  <div style={{ color: V.orange, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>
                    Linked to {inspectionContext.assetName} · inspection {inspectionContext.inspectionId.slice(0, 8)}
                  </div>
                ) : null}
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>
                  Center: {centerLatitude.toFixed(6)}, {centerLongitude.toFixed(6)}
                </div>
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 2 }}>
                  {Object.keys(waypointOverrides).length ? `${Object.keys(waypointOverrides).length} manually adjusted waypoint(s) are included.` : "Route uses DOMINIC-generated waypoint positions."}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <div style={{ display: showAdvancedPlanner ? "block" : "none" }}>
      <section style={{ margin: "12px 14px 0", border: `1px solid ${V.line}`, borderRadius: 10, background: V.panel, padding: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: "1 1 260px" }}>
            <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>Aircraft / camera geometry</div>
            <select
              aria-label="Capture aircraft camera"
              value={selectedAircraftId}
              onChange={(event) => applyAircraftCamera(event.target.value)}
              style={{ width: "100%", marginTop: 6, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 9 }}
            >
              <option value="">Manual / custom camera</option>
              {pilotAircraft.map((aircraft) => (
                <option key={aircraft.id} value={aircraft.id}>
                  {[aircraft.manufacturer, aircraft.model, aircraft.display_name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, flex: "0 1 310px" }}>
            <Field label="Horizontal FOV" value={horizontalFovDeg} min={25} max={140} step={0.1} suffix="deg" onChange={(value) => { setSelectedAircraftId(""); setHorizontalFovDeg(value); setCameraProfileMessage("Manual camera geometry active."); }} />
            <Field label="Vertical FOV" value={verticalFovDeg} min={20} max={120} step={0.1} suffix="deg" onChange={(value) => { setSelectedAircraftId(""); setVerticalFovDeg(value); setCameraProfileMessage("Manual camera geometry active."); }} />
          </div>
        </div>
        <p style={{ margin: "7px 0 0", color: V.muted, fontSize: 8, lineHeight: 1.4 }}>
          {cameraProfileMessage ?? (pilotAircraft.length ? "Select an aircraft from your Pilot Profile to apply its cataloged camera geometry, or leave Manual selected." : "No active Pilot Profile aircraft found. Enter camera field of view manually.")}
        </p>
      </section>

      {missionType !== "object" ? (
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "minmax(280px,.75fr) minmax(0,1.25fr)", gap: 14, alignItems: "start" }}>
          <aside style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 14 }}>
              <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>{activeProfile.label} geometry</div>
              <p style={{ color: V.muted, fontSize: 10, lineHeight: 1.5 }}>{activeProfile.summary}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Length" value={patternLengthFt} min={4} max={20000} suffix="ft" onChange={setPatternLengthFt} />
                <Field label="Width" value={patternWidthFt} min={4} max={2000} suffix="ft" onChange={setPatternWidthFt} />
                <Field label="Height" value={patternHeightFt} min={4} max={1000} suffix="ft" onChange={setPatternHeightFt} />
                <Field label="Altitude" value={patternAltitudeFt} min={8} max={1000} suffix="ft" onChange={setPatternAltitudeFt} />
                <Field label="Stand-off" value={patternStandoffFt} min={2} max={500} suffix="ft" onChange={setPatternStandoffFt} />
                <Field label="Overlap" value={patternOverlapPct} min={40} max={95} suffix="%" onChange={setPatternOverlapPct} />
                <Field label="Route heading" value={patternHeadingDeg} min={0} max={359} suffix="deg" onChange={setPatternHeadingDeg} />
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 14 }}>
              <div style={{ color: V.text, fontSize: 11, fontWeight: 900 }}>Capture logic</div>
              <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                {manualGuidance[missionType as Exclude<CaptureMissionType, "object">].map((item, index) => (
                  <div key={item} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 7, alignItems: "start", color: "#DCE3EA", fontSize: 10, lineHeight: 1.45 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(244,90,30,.15)", border: `1px solid rgba(244,90,30,.3)`, color: V.orange, display: "grid", placeItems: "center", fontWeight: 900 }}>{index + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 14 }}>
              <div style={{ color: V.text, fontSize: 11, fontWeight: 900 }}>Mission origin & aircraft</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
                <Field label="Center latitude" value={centerLatitude} min={-90} max={90} step={0.000001} onChange={setCenterLatitude} />
                <Field label="Center longitude" value={centerLongitude} min={-180} max={180} step={0.000001} onChange={setCenterLongitude} />
              </div>
              <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 7 }}>
                {effectiveSecondaryGeographicCheckpoints.length} geographic checkpoints generated · route heading {patternHeadingDeg}°.
              </div>
              <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 9, paddingTop: 9 }}>
                <div style={{ color: bridgeStatus === "connected" ? V.green : V.muted, fontSize: 8, fontWeight: 900, textTransform: "uppercase" }}>
                  Aircraft bridge · {bridgeStatus}
                </div>
                {bridgeStatus !== "connected" ? (
                  <>
                    <input
                      value={bridgeUrl}
                      onChange={(event) => setBridgeUrl(event.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8, marginTop: 7 }}
                    />
                    <button
                      type="button"
                      disabled={bridgeStatus === "connecting"}
                      onClick={() => void connectAircraftBridge()}
                      style={{ width: "100%", marginTop: 6, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      {bridgeStatus === "connecting" ? "Connecting..." : "Connect Aircraft Bridge"}
                    </button>
                  </>
                ) : (
                  <div style={{ color: V.muted, fontSize: 8, marginTop: 5 }}>
                    {bridgeInfo?.vendor.toUpperCase()} · {bridgeInfo?.model ?? bridgeInfo?.aircraftId}
                  </div>
                )}
              </div>
            </section>
          </aside>

          <main style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>Calculated capture pattern</div>
                  <div style={{ color: V.muted, fontSize: 10, marginTop: 3 }}>DOMINIC is generating real checkpoints for this mission type—not just instructions.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: secondaryCalibrationValidation.ready ? V.green : V.amber, fontSize: 9, fontWeight: 900 }}>
                    {secondaryCalibrationValidation.ready ? "GEOMETRY ACTIVE" : "SAFETY BLOCKED"}
                  </div>
                  <button
                    type="button"
                    onClick={downloadSecondaryCheckpointPayload}
                    disabled={!secondaryPlan || !effectiveSecondaryGeographicCheckpoints.length}
                    title="Export this DOMINIC pattern as a portable waypoint payload"
                    style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 8, padding: "6px 8px", display: "flex", alignItems: "center", gap: 5, cursor: secondaryPlan ? "pointer" : "not-allowed", fontSize: 9, fontWeight: 800 }}
                  >
                    <Download size={12} /> Export checkpoints
                  </button>
                </div>
              </div>

              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
                {[
                  ["Checkpoints", secondaryPlan?.checkpoints.length ?? 0],
                  ["Passes", secondaryPlan?.passCount ?? 0],
                  ["Est. time", `${secondaryPlan?.estimatedMinutes ?? 0} min`],
                  ["Warnings", secondaryPlan?.warnings.length ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${V.line}`, background: "#0D1319", borderRadius: 8, padding: 10 }}>
                    <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ color: V.text, fontSize: 16, fontWeight: 900, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>

              {secondaryCalibrationValidation.issues.length ? (
                <div style={{ padding: "0 14px 14px", display: "grid", gap: 6 }}>
                  {secondaryCalibrationValidation.issues.map((issue) => (
                    <div
                      key={issue.code}
                      style={{
                        border: `1px solid ${issue.severity === "blocker" ? "rgba(255,139,122,.35)" : "rgba(255,184,107,.3)"}`,
                        background: issue.severity === "blocker" ? "rgba(255,139,122,.06)" : "rgba(255,184,107,.05)",
                        color: issue.severity === "blocker" ? "#FFB6AA" : "#FFD0A0",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 9,
                        lineHeight: 1.45,
                      }}
                    >
                      <AlertTriangle size={12} style={{ marginRight: 5, verticalAlign: "text-bottom" }} />
                      <strong>{issue.severity === "blocker" ? "Flight blocker" : "Warning"}:</strong> {issue.message}
                      {issue.checkpointIds.length ? ` · ${issue.checkpointIds.length} affected checkpoint${issue.checkpointIds.length === 1 ? "" : "s"}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(220px,.6fr)", gap: 12 }}>
                <div style={{ border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", minHeight: 310, position: "relative", overflow: "hidden" }}>
                  <svg viewBox="0 0 100 70" style={{ width: "100%", height: "100%" }} role="img" aria-label={`${activeProfile.label} calculated capture pattern`}>
                    <rect x="20" y="14" width="60" height="42" rx="2" fill="rgba(244,90,30,.05)" stroke="rgba(244,90,30,.35)" strokeWidth=".6" />
                    {(secondaryPlan?.checkpoints ?? []).map((point, index, all) => {
                      const xs = all.map((p) => p.xFt);
                      const ys = all.map((p) => p.yFt);
                      const minX = Math.min(...xs, -1), maxX = Math.max(...xs, 1);
                      const minY = Math.min(...ys, -1), maxY = Math.max(...ys, 1);
                      const x = 8 + ((point.xFt - minX) / Math.max(1, maxX - minX)) * 84;
                      const y = 62 - ((point.yFt - minY) / Math.max(1, maxY - minY)) * 54;
                      const previous = index > 0 ? all[index - 1] : null;
                      let px = x, py = y;
                      if (previous) {
                        px = 8 + ((previous.xFt - minX) / Math.max(1, maxX - minX)) * 84;
                        py = 62 - ((previous.yFt - minY) / Math.max(1, maxY - minY)) * 54;
                      }
                      return (
                        <g key={point.id}>
                          {previous ? <line x1={px} y1={py} x2={x} y2={y} stroke="rgba(244,90,30,.28)" strokeWidth=".35" /> : null}
                          <circle cx={x} cy={y} r=".75" fill={point.cameraAngle <= -80 ? "#F5F7FA" : V.orange} />
                        </g>
                      );
                    })}
                  </svg>
                  <div style={{ position: "absolute", left: 10, bottom: 8, color: V.muted, fontSize: 8 }}>
                    White = nadir · Orange = oblique / horizontal capture
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ border: `1px solid ${V.line}`, borderRadius: 9, background: "#0D1319", padding: 10 }}>
                    <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase" }}>Pattern metrics</div>
                    {Object.entries(secondaryPlan?.metrics ?? {}).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, color: "#DCE3EA", fontSize: 9 }}>
                        <span>{key}</span><strong>{value.toFixed(1)}</strong>
                      </div>
                    ))}
                  </div>
                  {(secondaryPlan?.warnings ?? []).map((warning) => (
                    <div key={warning} style={{ border: `1px solid rgba(255,184,107,.22)`, background: "rgba(255,184,107,.05)", color: "#FFD0A0", borderRadius: 8, padding: 9, fontSize: 9, lineHeight: 1.45 }}>
                      <AlertTriangle size={12} style={{ marginRight: 5, verticalAlign: "text-bottom" }} /> {warning}
                    </div>
                  ))}
                  <div style={{ border: `1px solid rgba(112,214,160,.18)`, background: "rgba(112,214,160,.04)", color: "#BFEBD2", borderRadius: 8, padding: 9, fontSize: 9, lineHeight: 1.45 }}>
                    This pattern uses the same checkpoint concept as Object Scan and can be georeferenced for manual guidance or passed to the universal mission engine.
                  </div>

                  <div style={{ border: `1px solid ${secondaryCoverage.missing ? "rgba(255,184,107,.25)" : "rgba(112,214,160,.25)"}`, background: "#0D1319", borderRadius: 9, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div>
                        <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Capture QA · did I get everything?</div>
                        <div style={{ color: V.muted, fontSize: 8, marginTop: 3 }}>Pose + image quality checked against every planned view.</div>
                      </div>
                      <div style={{ color: secondaryCoverage.coveragePct >= 90 ? V.green : secondaryCoverage.coveragePct >= 70 ? V.amber : "#FF8B7A", fontSize: 18, fontWeight: 900 }}>
                        {secondaryCoverage.coveragePct}%
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 8 }}>
                      {[
                        ["Good", secondaryCoverage.covered, V.green],
                        ["Weak", secondaryCoverage.weak, V.amber],
                        ["Missing", secondaryCoverage.missing, "#FF8B7A"],
                      ].map(([label, value, color]) => (
                        <div key={String(label)} style={{ border: `1px solid ${V.line}`, borderRadius: 7, padding: 6 }}>
                          <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
                          <div style={{ color: String(color), fontSize: 13, fontWeight: 900, marginTop: 2 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {currentSecondaryCheckpoint ? (
                      <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 8, paddingTop: 8 }}>
                        <div style={{ color: V.text, fontSize: 9, fontWeight: 900 }}>
                          Checkpoint {activeSecondaryIndex + 1}/{effectiveSecondaryGeographicCheckpoints.length}
                        </div>
                        <div style={{ color: V.muted, fontSize: 8, marginTop: 3 }}>
                          {currentSecondaryCheckpoint.passId} · {currentSecondaryCheckpoint.relativeAltitudeFt.toFixed(1)} ft · camera {currentSecondaryCheckpoint.cameraAngle}°
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginTop: 7 }}>
                          <button type="button" disabled={activeSecondaryIndex === 0} onClick={() => setSecondaryIndex((index) => Math.max(0, index - 1))} style={{ border: `1px solid ${V.line}`, background: "#151D25", color: V.text, borderRadius: 6, padding: "6px 5px", fontSize: 8, fontWeight: 800 }}>Previous</button>
                          <button type="button" onClick={(event) => markSecondaryCaptured(Math.round(event.timeStamp))} style={{ border: 0, background: V.orange, color: "#180A02", borderRadius: 6, padding: "6px 5px", fontSize: 8, fontWeight: 900 }}>Mark captured</button>
                          <button type="button" disabled={activeSecondaryIndex >= effectiveSecondaryGeographicCheckpoints.length - 1} onClick={() => setSecondaryIndex((index) => Math.min(effectiveSecondaryGeographicCheckpoints.length - 1, index + 1))} style={{ border: `1px solid ${V.line}`, background: "#151D25", color: V.text, borderRadius: 6, padding: "6px 5px", fontSize: 8, fontWeight: 800 }}>Next</button>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={secondaryImageStatus === "analyzing"}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void analyzeSecondaryImage(file, Math.round(event.timeStamp));
                            event.currentTarget.value = "";
                          }}
                          style={{ width: "100%", marginTop: 7, color: V.muted, fontSize: 8 }}
                        />
                        {secondaryImageMessage ? (
                          <div style={{ color: secondaryImageStatus === "error" ? "#FF8B7A" : V.green, fontSize: 8, lineHeight: 1.4, marginTop: 5 }}>{secondaryImageMessage}</div>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 8, paddingTop: 8 }}>
                      <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>Coverage by pass</div>
                      <div style={{ display: "grid", gap: 4, maxHeight: 92, overflowY: "auto", marginTop: 5 }}>
                        {Object.entries(secondaryCoverageByPass).map(([pass, stats]) => (
                          <div key={pass} style={{ display: "flex", justifyContent: "space-between", gap: 7, color: "#DCE3EA", fontSize: 8 }}>
                            <span>{pass}</span>
                            <span style={{ color: V.muted }}>{stats.covered} good · {stats.weak} weak · {stats.missing} missing</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ color: secondaryRepairPlan.length ? V.amber : V.green, fontSize: 8, fontWeight: 900 }}>
                          {secondaryRepairPlan.length ? `${secondaryRepairPlan.length} views need repair` : "Capture set passes current QA"}
                        </div>
                        <button type="button" onClick={resetSecondaryCaptureQa} style={{ border: 0, background: "transparent", color: V.muted, fontSize: 8, textDecoration: "underline", cursor: "pointer" }}>Reset QA</button>
                      </div>
                      {secondaryRepairPlan.length ? (
                        <div style={{ display: "grid", gap: 4, maxHeight: 92, overflowY: "auto", marginTop: 5 }}>
                          {secondaryRepairPlan.slice(0, 12).map((repair) => (
                            <button
                              key={repair.id}
                              type="button"
                              onClick={() => {
                                const index = effectiveSecondaryGeographicCheckpoints.findIndex((point) => point.id === repair.sourceCheckpointId);
                                if (index >= 0) setSecondaryIndex(index);
                              }}
                              style={{ border: `1px solid ${repair.priority === 2 ? "rgba(255,139,122,.2)" : "rgba(255,184,107,.2)"}`, background: "transparent", color: repair.priority === 2 ? "#FFB6AA" : "#FFD0A0", borderRadius: 6, padding: "5px 6px", textAlign: "left", fontSize: 7, cursor: "pointer" }}
                            >
                              {repair.priority === 2 ? "MISSING" : "WEAK"} · {"passId" in repair ? repair.passId : "capture"} · #{repair.sequence}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {secondaryRepairPlan.length ? (
                        <div style={{ display: "grid", gridTemplateColumns: missionType === "interior" ? "1fr" : "1fr 1fr", gap: 5, marginTop: 7 }}>
                          <button
                            type="button"
                            disabled={autonomousRunning}
                            onClick={() => void runSecondarySimulation("repair")}
                            style={{ border: `1px solid rgba(255,184,107,.28)`, background: "rgba(255,184,107,.06)", color: "#FFD0A0", borderRadius: 6, padding: "6px 7px", fontSize: 8, fontWeight: 900, cursor: autonomousRunning ? "not-allowed" : "pointer" }}
                          >
                            Simulate repair pass
                          </button>
                          {missionType !== "interior" ? (
                            <button
                              type="button"
                              disabled={!secondaryFlightApproved || bridgeStatus !== "connected" || !productionFlightUnlocked || !benchReport?.readyForPropOnFieldTest || autonomousRunning}
                              onClick={() => void runSecondaryConnectedMission("repair")}
                              style={{ border: `1px solid rgba(112,214,160,.28)`, background: "rgba(112,214,160,.06)", color: V.green, borderRadius: 6, padding: "6px 7px", fontSize: 8, fontWeight: 900, cursor: secondaryFlightApproved && bridgeStatus === "connected" && productionFlightUnlocked && benchReport?.readyForPropOnFieldTest && !autonomousRunning ? "pointer" : "not-allowed", opacity: secondaryFlightApproved && bridgeStatus === "connected" && productionFlightUnlocked && benchReport?.readyForPropOnFieldTest ? 1 : .5 }}
                            >
                              Fly repair pass
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ border: `1px solid rgba(244,90,30,.24)`, background: "rgba(244,90,30,.04)", borderRadius: 9, padding: 9 }}>
                    <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
                      Universal mission execution
                    </div>
                    <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 4 }}>
                      Run this calculated {activeProfile.label.toLowerCase()} pattern through the same safety-supervised mission engine used by Object Scan.
                    </div>
                    <button
                      type="button"
                      disabled={autonomousRunning || !effectiveSecondaryGeographicCheckpoints.length}
                      onClick={() => void runSecondarySimulation()}
                      style={{ width: "100%", marginTop: 7, border: 0, background: autonomousRunning ? "#39424B" : `linear-gradient(90deg,${V.orangeDark},${V.orange})`, color: autonomousRunning ? "#88939E" : "#180A02", borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: autonomousRunning ? "not-allowed" : "pointer" }}
                    >
                      Run {activeProfile.label} Simulation
                    </button>

                    {missionType === "interior" ? (
                      <div style={{ color: V.amber, fontSize: 8, lineHeight: 1.4, marginTop: 7 }}>
                        Connected autonomous Interior execution remains locked until a supported local-positioning / SLAM navigation source is available.
                      </div>
                    ) : (
                      <>
                        <label style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 6, alignItems: "start", color: bridgeStatus === "connected" ? "#DCE3EA" : V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 8 }}>
                          <input
                            type="checkbox"
                            disabled={
                              bridgeStatus !== "connected" ||
                              !productionFlightUnlocked ||
                              autonomousRunning
                            }
                            checked={secondaryFlightApproved}
                            onChange={(event) =>
                              setSecondaryFlightApprovalSignature(
                                event.target.checked
                                  ? secondaryFlightPlanSignature
                                  : null,
                              )
                            }
                          />
                          <span>I confirm this displayed pattern, mission center/orientation, aircraft, RTH point, airspace and obstacles are safe for autonomous execution.</span>
                        </label>
                        <button
                          type="button"
                          disabled={
                            bridgeStatus !== "connected" ||
                            !productionFlightUnlocked ||
                            !secondaryFlightApproved ||
                            autonomousRunning
                          }
                          onClick={() => void runSecondaryConnectedMission()}
                          style={{ width: "100%", marginTop: 7, border: `1px solid ${secondaryFlightApproved ? "rgba(112,214,160,.35)" : V.line}`, background: secondaryFlightApproved ? "rgba(112,214,160,.1)" : "#1B222A", color: secondaryFlightApproved ? V.green : "#6F7A84", borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: secondaryFlightApproved ? "pointer" : "not-allowed" }}
                        >
                          Execute {activeProfile.label} on Connected Aircraft
                        </button>
                      </>
                    )}

                    {autonomousSnapshot ? (
                      <div style={{ marginTop: 7, color: autonomousSnapshot.phase === "COMPLETE" ? V.green : autonomousSnapshot.phase === "ABORTED" || autonomousSnapshot.phase === "FAILED" ? "#FFB6AA" : V.muted, fontSize: 8, lineHeight: 1.4 }}>
                        {autonomousSnapshot.phase} · {autonomousSnapshot.completedCheckpointIds.length}/{autonomousSnapshot.checkpointCount} checkpoints
                        {autonomousSnapshot.safetyIssues.length ? ` · ${autonomousSnapshot.safetyIssues[0].message}` : ""}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>      ) : (
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "minmax(270px,.72fr) minmax(420px,1.5fr) minmax(270px,.78fr)", gap: 12, alignItems: "start" }}>
          <aside style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>Object geometry</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
                <Field label="Diameter" value={objectDiameterFt} min={1} max={500} suffix="ft" onChange={setObjectDiameterFt} />
                <Field label="Height" value={objectHeightFt} min={1} max={500} suffix="ft" onChange={setObjectHeightFt} />
                <Field label="Stand-off" value={standoffFt} min={3} max={500} suffix="ft" onChange={setStandoffFt} />
                <Field label="Overlap" value={overlapPct} min={40} max={95} suffix="%" onChange={setOverlapPct} />
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: V.text, fontSize: 12, fontWeight: 900 }}>
                <MapPinned size={16} color={V.orange} /> Subject center
              </div>
              <p style={{ margin: "6px 0 10px", color: V.muted, fontSize: 9, lineHeight: 1.45 }}>
                Georeference the object once. DOMINIC projects every ring checkpoint into latitude/longitude for the future autonomous mission layer.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Latitude" value={centerLatitude} min={-90} max={90} step={0.000001} onChange={setCenterLatitude} />
                <Field label="Longitude" value={centerLongitude} min={-180} max={180} step={0.000001} onChange={setCenterLongitude} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Field label="Base relative altitude" value={baseRelativeAltitudeFt} min={-200} max={2000} step={1} suffix="ft" onChange={setBaseRelativeAltitudeFt} />
              </div>
              <div style={{ marginTop: 9, border: `1px solid rgba(112,214,160,.18)`, background: "rgba(112,214,160,.05)", borderRadius: 8, padding: 8, color: "#BFEBD2", fontSize: 9, lineHeight: 1.45 }}>
                {geographicCheckpoints.length} geographic checkpoints generated. First point: {geographicCheckpoints[0]?.latitude.toFixed(6)}, {geographicCheckpoints[0]?.longitude.toFixed(6)}.
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: V.text, fontSize: 12, fontWeight: 900 }}>
                  <Home size={16} color={V.orange} /> Mission calibration
                </div>
                <span style={{ color: calibrationValidation.ready ? V.green : V.amber, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {calibrationValidation.ready ? "Geometry clear" : "Action required"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <Field label="Home latitude" value={homeLatitude} min={-90} max={90} step={0.000001} onChange={(value) => { setMissionArmed(false); setHomeLatitude(value); }} />
                <Field label="Home longitude" value={homeLongitude} min={-180} max={180} step={0.000001} onChange={(value) => { setMissionArmed(false); setHomeLongitude(value); }} />
                <Field label="Min altitude" value={minRelativeAltitudeFt} min={-200} max={2000} suffix="ft" onChange={(value) => { setMissionArmed(false); setMinRelativeAltitudeFt(value); }} />
                <Field label="Max altitude" value={maxRelativeAltitudeFt} min={0} max={2000} suffix="ft" onChange={(value) => { setMissionArmed(false); setMaxRelativeAltitudeFt(value); }} />
                <Field label="Min stand-off" value={minStandoffFt} min={1} max={500} suffix="ft" onChange={(value) => { setMissionArmed(false); setMinStandoffFt(value); }} />
                <Field label="Max stand-off" value={maxStandoffFt} min={1} max={1000} suffix="ft" onChange={(value) => { setMissionArmed(false); setMaxStandoffFt(value); }} />
              </div>

              <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 12, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ color: V.muted, fontSize: 9, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Obstacle / no-fly sectors</div>
                  <button type="button" onClick={addNoFlySector} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "5px 7px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 8 }}>
                    <Plus size={11} /> Add sector
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {noFlySectors.length ? noFlySectors.map((sector) => (
                    <div key={sector.id} style={{ border: `1px solid rgba(255,184,107,.2)`, borderRadius: 8, background: "rgba(255,184,107,.04)", padding: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                        <input
                          value={sector.label}
                          onChange={(event) => updateNoFlySector(sector.id, { label: event.target.value })}
                          style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 6, padding: "6px 7px", fontSize: 9 }}
                        />
                        <button type="button" onClick={() => removeNoFlySector(sector.id)} aria-label={`Remove ${sector.label}`} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: "#FF8B7A", borderRadius: 6, width: 30, cursor: "pointer", display: "grid", placeItems: "center" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 7 }}>
                        <Field label="Start bearing" value={sector.startBearingDeg} min={0} max={359} suffix="deg" onChange={(value) => updateNoFlySector(sector.id, { startBearingDeg: value })} />
                        <Field label="End bearing" value={sector.endBearingDeg} min={0} max={359} suffix="deg" onChange={(value) => updateNoFlySector(sector.id, { endBearingDeg: value })} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: V.muted, fontSize: 9, lineHeight: 1.45 }}>No blocked sectors defined. Add sectors for roads, wires, structures, people, or any direction the planned orbit must not enter.</div>
                  )}
                </div>
              </div>
            </section>

            <section style={{ border: `1px solid rgba(244,90,30,.28)`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: V.text, fontSize: 12, fontWeight: 900 }}>
                  <Radio size={16} color={V.orange} /> Aircraft bridge
                </div>
                <span style={{ color: bridgeStatus === "connected" ? V.green : bridgeStatus === "error" ? "#FF8B7A" : V.muted, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
                  {bridgeStatus}
                </span>
              </div>
              <p style={{ margin: "6px 0 9px", color: V.muted, fontSize: 9, lineHeight: 1.45 }}>
                Connect DOMINIC to a local Flight Bridge. The bridge can represent DJI, MAVLink/PX4/ArduPilot, Autel, or another supported adapter.
              </p>
              <input
                value={bridgeUrl}
                disabled={bridgeStatus === "connected" || bridgeStatus === "connecting"}
                onChange={(event) => setBridgeUrl(event.target.value)}
                placeholder="ws://127.0.0.1:8787"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 8, padding: "8px 9px", fontSize: 10, outline: 0 }}
              />
              <button
                type="button"
                onClick={bridgeStatus === "connected" ? disconnectAircraftBridge : connectAircraftBridge}
                disabled={bridgeStatus === "connecting"}
                style={{
                  width: "100%",
                  marginTop: 8,
                  border: bridgeStatus === "connected" ? `1px solid ${V.line}` : 0,
                  background: bridgeStatus === "connected" ? "#0D1319" : bridgeStatus === "connecting" ? "#39424B" : `linear-gradient(90deg,${V.orangeDark},${V.orange})`,
                  color: bridgeStatus === "connected" ? V.text : bridgeStatus === "connecting" ? "#88939E" : "#180A02",
                  borderRadius: 8,
                  padding: "8px 9px",
                  fontWeight: 900,
                  cursor: bridgeStatus === "connecting" ? "not-allowed" : "pointer",
                  fontSize: 9,
                }}
              >
                {bridgeStatus === "connected" ? "Disconnect Aircraft Bridge" : bridgeStatus === "connecting" ? "Connecting..." : "Connect Aircraft Bridge"}
              </button>
              {bridgeError ? <div style={{ color: "#FF9A86", fontSize: 8, lineHeight: 1.4, marginTop: 7 }}>{bridgeError}</div> : null}
              {bridgeInfo ? (
                <div style={{ marginTop: 9, border: `1px solid rgba(112,214,160,.18)`, background: "rgba(112,214,160,.05)", borderRadius: 8, padding: 8 }}>
                  <div style={{ color: V.green, fontSize: 9, fontWeight: 900 }}>{bridgeInfo.vendor.toUpperCase()} · {bridgeInfo.model ?? bridgeInfo.aircraftId}</div>
                  <div style={{ color: V.muted, fontSize: 8, marginTop: 4, lineHeight: 1.4 }}>
                    {Object.entries(bridgeInfo.capabilities).filter(([, enabled]) => enabled).map(([name]) => name).join(" · ")}
                  </div>
                  <div style={{ borderTop: `1px solid rgba(112,214,160,.16)`, marginTop: 7, paddingTop: 7 }}>
                    <div style={{ color: "#BFEBD2", fontSize: 8, fontWeight: 900 }}>
                      Automatic inspection ingestion · {automaticMediaCount} captured · {automaticScreeningCount} AI-screened
                    </div>
                    <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 3 }}>
                      {automaticMediaStatus ?? (inspectionContext
                        ? "Waiting for aircraft capture events. Eligible RGB/zoom inspection images are quality-checked, saved to the active asset, and queued for DOMINIC screening automatically."
                        : "Waiting for aircraft capture events. Photos are quality-checked and added to coverage automatically. Start from Asset Intelligence to attach them to an inspection.")}
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid rgba(112,214,160,.16)`, marginTop: 8, paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ color: V.text, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
                        Bench / HITL readiness
                      </div>
                      <span style={{ color: benchReport?.readyForPropOnFieldTest ? V.green : benchReport?.readyForPropsOffBench ? V.amber : V.muted, fontSize: 8, fontWeight: 900 }}>
                        {benchReport
                          ? benchReport.readyForPropOnFieldTest
                            ? "FIELD READY"
                            : benchReport.readyForPropsOffBench
                              ? "BENCH READY"
                              : "BLOCKED"
                          : "NOT RUN"}
                      </span>
                    </div>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", color: V.muted, fontSize: 8, marginTop: 6 }}>
                      <input
                        type="checkbox"
                        checked={benchRequireRtk}
                        disabled={benchRunning}
                        onChange={(event) => {
                          setBenchRequireRtk(event.target.checked);
                          setBenchReport(null);
                        }}
                      />
                      Require RTK FIX for field readiness
                    </label>
                    <button
                      type="button"
                      disabled={benchRunning}
                      onClick={() => void runConnectedBenchReadiness()}
                      style={{ width: "100%", marginTop: 7, border: `1px solid ${V.line}`, background: "#0D1319", color: benchRunning ? "#6F7A84" : V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: benchRunning ? "not-allowed" : "pointer" }}
                    >
                      {benchRunning ? "Running Bench Checks..." : "Run Bench / HITL Readiness"}
                    </button>
                    {benchReport ? (
                      <div style={{ display: "grid", gap: 4, marginTop: 7 }}>
                        {benchReport.checks.map((check) => (
                          <div key={check.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr", gap: 5, alignItems: "start", color: check.status === "pass" ? "#BFEBD2" : check.status === "fail" ? "#FFB6AA" : check.status === "warn" ? "#FFD0A0" : V.muted, fontSize: 8, lineHeight: 1.35 }}>
                            <span>{check.status === "pass" ? "✓" : check.status === "fail" ? "×" : check.status === "warn" ? "!" : "–"}</span>
                            <span><strong>{check.label}</strong> · {check.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ borderTop: `1px solid rgba(112,214,160,.16)`, marginTop: 9, paddingTop: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ color: V.text, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
                          Flight validation ladder
                        </div>
                        <span style={{ color: productionFlightUnlocked ? V.green : V.amber, fontSize: 8, fontWeight: 900 }}>
                          {productionFlightUnlocked
                            ? "PRODUCTION UNLOCKED"
                            : (flightValidationStatus?.currentStage ?? "simulation").replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: "grid", gap: 4, marginTop: 7 }}>
                        {[
                          ["Simulation", Boolean(flightValidation?.simulationVerifiedAtMs)],
                          ["Bench / HITL", Boolean(flightValidation?.benchVerifiedAtMs)],
                          ["Controlled field", Boolean(flightValidation?.controlledFieldVerifiedAtMs)],
                        ].map(([label, done]) => (
                          <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: done ? "#BFEBD2" : V.muted, fontSize: 8 }}>
                            <span>{done ? "✓" : "○"} {label}</span>
                            <span>{done ? "verified" : "required"}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 7 }}>
                        Full simulation and Bench/HITL are recorded automatically for this exact aircraft and capture plan. Controlled field validation is a pilot attestation after a supervised proving flight.
                      </div>
                      <textarea
                        value={controlledFieldNotes}
                        disabled={!flightValidation?.simulationVerifiedAtMs || !flightValidation?.benchVerifiedAtMs || productionFlightUnlocked}
                        onChange={(event) => setControlledFieldNotes(event.target.value)}
                        placeholder="Controlled field test notes: location, short route, result, anomalies..."
                        style={{ width: "100%", boxSizing: "border-box", minHeight: 54, marginTop: 7, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8, resize: "vertical" }}
                      />
                      <button
                        type="button"
                        disabled={
                          !flightValidation?.simulationVerifiedAtMs ||
                          !flightValidation?.benchVerifiedAtMs ||
                          productionFlightUnlocked
                        }
                        onClick={recordControlledFieldValidation}
                        style={{ width: "100%", marginTop: 6, border: `1px solid ${V.line}`, background: productionFlightUnlocked ? "rgba(112,214,160,.08)" : "#0D1319", color: productionFlightUnlocked ? V.green : V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: productionFlightUnlocked ? "default" : "pointer" }}
                      >
                        {productionFlightUnlocked ? "Controlled Field Validation Recorded" : "Record Controlled Field Validation"}
                      </button>
                      {validationMessage ? (
                        <div style={{ color: productionFlightUnlocked ? V.green : V.amber, fontSize: 8, lineHeight: 1.4, marginTop: 6 }}>
                          {validationMessage}
                        </div>
                      ) : null}
                      {flightValidationStatus?.blockers.length ? (
                        <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                          {flightValidationStatus.blockers.slice(0, 4).map((blocker) => (
                            <div key={blocker} style={{ color: V.muted, fontSize: 8, lineHeight: 1.35 }}>
                              • {blocker}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: V.text, fontSize: 12, fontWeight: 900 }}><ShieldCheck size={16} color={V.orange} /> Safety gate</div>
              <div style={{ display: "grid", gap: 8, marginTop: 11 }}>
                {safetyItems.map((item, index) => (
                  <label key={item} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 7, alignItems: "start", color: safety[index] ? "#DCE3EA" : V.muted, fontSize: 10, lineHeight: 1.45, cursor: "pointer" }}>
                    <input type="checkbox" checked={Boolean(safety[index])} onChange={(event) => setSafety((state) => ({ ...state, [index]: event.target.checked }))} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 10, color: safetyReady ? V.green : V.amber, fontSize: 10, fontWeight: 800 }}>
                {safetyReady ? "Safety gate acknowledged." : "Acknowledge all items before beginning the guided run."}
              </div>
            </section>
          </aside>

          <main style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>Preflight flight envelope</div>
                  <div style={{ color: V.muted, fontSize: 10, marginTop: 3 }}>Subject center, three capture rings, home direction and blocked sectors.</div>
                </div>
                <div style={{ color: preflightReady ? V.green : V.amber, fontSize: 9, fontWeight: 900 }}>
                  {preflightReady ? "PREFLIGHT CLEAR" : "PREFLIGHT BLOCKED"}
                </div>
              </div>

              <div style={{ minHeight: 330, display: "grid", placeItems: "center", background: "radial-gradient(circle at center, rgba(244,90,30,.08), transparent 63%)", position: "relative" }}>
                <svg viewBox="0 0 100 100" role="img" aria-label="DOMINIC object scan preflight flight envelope" style={{ width: "min(92%, 440px)", height: "auto", overflow: "visible" }}>
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#26313A" strokeWidth="0.7" />
                  {noFlySectors.map((sector) => (
                    <path key={sector.id} d={sectorPath(sector.startBearingDeg, sector.endBearingDeg)} fill="rgba(255,107,91,.18)" stroke="rgba(255,139,122,.6)" strokeWidth="0.45" />
                  ))}
                  {[36, 29, 22].map((radius, index) => (
                    <circle
                      key={radius}
                      cx="50"
                      cy="50"
                      r={radius}
                      fill="none"
                      stroke={index === 1 ? V.orange : "#66727D"}
                      strokeWidth={index === 1 ? 1.1 : 0.65}
                      strokeDasharray={index === 1 ? undefined : "2.4 2.4"}
                    />
                  ))}
                  {sequence.filter((_, index) => index % Math.max(1, Math.floor(sequence.length / 72)) === 0).map((shot) => {
                    const ringIndex = shot.ringId === "low" ? 2 : shot.ringId === "mid" ? 1 : 0;
                    const radius = [36, 29, 22][ringIndex];
                    const point = polarPoint(shot.bearingDeg, radius);
                    const blocked = noFlySectors.some((sector) => {
                      const start = ((sector.startBearingDeg % 360) + 360) % 360;
                      const end = ((sector.endBearingDeg % 360) + 360) % 360;
                      const bearing = ((shot.bearingDeg % 360) + 360) % 360;
                      return start < end ? bearing >= start && bearing <= end : start > end ? bearing >= start || bearing <= end : false;
                    });
                    return <circle key={shot.id} cx={point.x} cy={point.y} r="0.75" fill={blocked ? "#FF8B7A" : "#F5F7FA"} opacity={blocked ? .95 : .72} />;
                  })}
                  <circle cx="50" cy="50" r="5.2" fill="#1C252D" stroke={V.orange} strokeWidth="0.8" />
                  <circle cx="50" cy="50" r="1.2" fill={V.orange} />
                  {(() => {
                    const orbitRadiusFt = Math.max(plan.rings[0]?.radiusFt ?? 1, 1);
                    const displayRadius = Math.min(45, Math.max(8, (homeVector.distanceFt / (orbitRadiusFt * 1.65)) * 36));
                    const home = polarPoint(homeVector.bearingDeg, displayRadius);
                    return (
                      <>
                        <line x1="50" y1="50" x2={home.x} y2={home.y} stroke="rgba(112,214,160,.55)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                        <circle cx={home.x} cy={home.y} r="2.2" fill={V.green} stroke="#0B1117" strokeWidth="0.8" />
                      </>
                    );
                  })()}
                  <text x="50" y="3.8" textAnchor="middle" fill="#8F9CAA" fontSize="3">N</text>
                  <text x="96" y="51" textAnchor="middle" fill="#8F9CAA" fontSize="3">E</text>
                  <text x="50" y="99" textAnchor="middle" fill="#8F9CAA" fontSize="3">S</text>
                  <text x="4" y="51" textAnchor="middle" fill="#8F9CAA" fontSize="3">W</text>
                </svg>

                <div style={{ position: "absolute", left: 13, bottom: 11, display: "grid", gap: 4, color: V.muted, fontSize: 9 }}>
                  <div><span style={{ color: V.green }}>●</span> Home · {homeVector.distanceFt.toFixed(0)} ft · {homeVector.bearingDeg.toFixed(0)}°</div>
                  <div><span style={{ color: V.orange }}>○</span> Planned capture rings · {plan.totalShots} frames</div>
                  <div><span style={{ color: "#FF8B7A" }}>◢</span> Blocked sectors · {noFlySectors.length}</div>
                </div>
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>3-ring capture path</div>
                  <div style={{ color: V.muted, fontSize: 10, marginTop: 3 }}>Fly each ring continuously in one direction while keeping the subject centered.</div>
                </div>
                <button type="button" onClick={resetRun} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 8, padding: "7px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 9 }}>
                  <RotateCcw size={12} /> Reset
                </button>
              </div>

              <div style={{ minHeight: 310, display: "grid", placeItems: "center", position: "relative", background: "radial-gradient(circle at center, rgba(244,90,30,.08), transparent 60%)", overflow: "hidden" }}>
                {[250, 190, 130].map((size, index) => {
                  const ring = plan.rings[2 - index];
                  return (
                    <div key={ring.id} style={{ position: "absolute", width: size, height: Math.round(size * .55), borderRadius: "50%", border: `2px ${index === 1 ? "solid" : "dashed"} ${index === 1 ? V.orange : "#53606D"}`, transform: `rotate(${index === 0 ? -4 : index === 2 ? 4 : 0}deg)`, opacity: .95 }} />
                  );
                })}
                <div style={{ width: 76, height: 76, borderRadius: 16, border: `1px solid ${V.orange}`, background: "linear-gradient(145deg,#303A43,#151C23)", display: "grid", placeItems: "center", zIndex: 3, boxShadow: "0 12px 35px rgba(0,0,0,.35)" }}>
                  <Target size={29} color={V.orange} />
                </div>
                <div style={{ position: "absolute", left: 14, bottom: 12, display: "grid", gap: 5 }}>
                  {plan.rings.map((ring) => (
                    <div key={ring.id} style={{ display: "flex", alignItems: "center", gap: 6, color: V.muted, fontSize: 9 }}>
                      <CircleDot size={11} color={ring.id === "mid" ? V.orange : "#8A95A7"} />
                      {ring.label}: {ring.shots} frames · camera {ring.cameraAngle}°
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 13, borderTop: `1px solid ${V.line}`, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {[
                  ["Frames", plan.totalShots],
                  ["Est. time", `${plan.estimatedMinutes} min`],
                  ["Image step", `${plan.stepWidthFt.toFixed(1)} ft`],
                  ["Stand-off", `${standoffFt} ft`],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: "8px 9px" }}>
                    <div style={{ color: V.muted, fontSize: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900 }}>{value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 900 }}><Navigation size={15} color={V.orange} /> Live guided capture</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: V.muted, fontSize: 9 }}>{capturedCount}/{plan.totalShots} captured</div>
                  <button
                    type="button"
                    onClick={downloadCheckpointPayload}
                    style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 8, padding: "6px 8px", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 9, fontWeight: 800 }}
                    title="Export DOMINIC checkpoint payload for future autonomous translation"
                  >
                    <Download size={12} /> Export checkpoints
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 11, border: `1px solid ${preflightReady ? "rgba(112,214,160,.35)" : "rgba(255,184,107,.28)"}`, borderRadius: 10, background: preflightReady ? "rgba(112,214,160,.05)" : "rgba(255,184,107,.05)", padding: 11 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: preflightReady ? V.green : V.amber, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
                      {missionArmed ? "Guided capture armed" : preflightReady ? "Preflight ready" : "Preflight blocked"}
                    </div>
                    <div style={{ color: V.muted, fontSize: 9, marginTop: 3 }}>
                      {preflightReady
                        ? "Safety acknowledgements and calibration constraints are clear."
                        : "Resolve safety acknowledgements and calibration blockers before starting."}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!preflightReady}
                    onClick={() => setMissionArmed((value) => !value)}
                    style={{
                      border: 0,
                      background: preflightReady ? (missionArmed ? "#23312C" : `linear-gradient(90deg,${V.orangeDark},${V.orange})`) : "#39424B",
                      color: preflightReady ? (missionArmed ? V.green : "#180A02") : "#88939E",
                      borderRadius: 8,
                      padding: "9px 11px",
                      fontWeight: 900,
                      cursor: preflightReady ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10,
                    }}
                  >
                    <Play size={13} /> {missionArmed ? "Disarm capture" : "Start Guided Capture"}
                  </button>
                </div>

                {calibrationValidation.issues.length ? (
                  <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                    {calibrationValidation.issues.map((issue) => (
                      <div key={issue.code} style={{ color: issue.severity === "blocker" ? "#FFB6AA" : "#FFD0A0", fontSize: 9, lineHeight: 1.4 }}>
                        {issue.severity === "blocker" ? "BLOCKER" : "WARNING"} · {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {current ? (
                <div style={{ marginTop: 11, border: `1px solid ${V.line}`, borderRadius: 10, background: "#0D1319", padding: 13 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
                    <div>
                      <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{current.ringLabel}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>Frame {current.shotNumber} of {current.totalInRing}</div>
                      <div style={{ color: V.muted, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                        Move to bearing <strong style={{ color: V.text }}>{current.bearingDeg}°</strong>, hold about <strong style={{ color: V.text }}>{current.radiusFt.toFixed(1)} ft</strong> from subject center, aim camera <strong style={{ color: V.text }}>{current.cameraAngle}°</strong>, center the subject, then capture.
                      </div>
                    </div>
                    <Crosshair size={36} color={V.orange} />
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(210px,.85fr) minmax(0,1.15fr)", gap: 10 }}>
                    <div style={{ border: `1px solid ${guidance?.ready ? "rgba(112,214,160,.45)" : V.line}`, borderRadius: 10, background: guidance?.ready ? "rgba(112,214,160,.07)" : V.panel, padding: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: V.text, fontSize: 10, fontWeight: 900 }}>
                          <Radio size={13} color={telemetryTrusted ? V.green : V.orange} /> Flight telemetry
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => setTelemetryMode("simulator")} style={{ border: `1px solid ${telemetryMode === "simulator" ? V.orange : V.line}`, background: "#0D1319", color: telemetryMode === "simulator" ? "#FFD3C0" : V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: "pointer" }}>
                            Manual
                          </button>
                          <button type="button" onClick={simulateAircraftAtCheckpoint} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: "pointer" }}>
                            Sim aircraft
                          </button>
                          <button type="button" onClick={useBrowserAircraftPosition} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: "pointer" }}>
                            Device GPS
                          </button>
                        </div>
                      </div>
                      {telemetryMode === "simulator" ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 9 }}>
                            <Field label="Bearing" value={telemetryBearingDeg} min={0} max={359} suffix="deg" onChange={setTelemetryBearingDeg} />
                            <Field label="Radius" value={telemetryDistanceFt} min={1} max={500} step={0.5} suffix="ft" onChange={setTelemetryDistanceFt} />
                            <Field label="Camera" value={telemetryCameraAngle} min={-90} max={30} suffix="deg" onChange={setTelemetryCameraAngle} />
                          </div>
                          <button type="button" onClick={snapTelemetryToCheckpoint} style={{ marginTop: 8, border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: "pointer" }}>
                            Snap manual telemetry to checkpoint
                          </button>
                        </>
                      ) : (
                        <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                            {[
                              ["Bearing", relativeAircraftTelemetry ? `${relativeAircraftTelemetry.bearingDeg.toFixed(0)}°` : "—"],
                              ["Radius", relativeAircraftTelemetry ? `${relativeAircraftTelemetry.distanceFt.toFixed(1)} ft` : "—"],
                              ["Gimbal", relativeAircraftTelemetry ? `${relativeAircraftTelemetry.cameraAngle.toFixed(0)}°` : "—"],
                            ].map(([label, value]) => (
                              <div key={label} style={{ border: `1px solid ${V.line}`, background: "#0D1319", borderRadius: 7, padding: 7 }}>
                                <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
                                <div style={{ color: V.text, fontSize: 11, fontWeight: 900, marginTop: 2 }}>{value}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ color: telemetryTrusted ? V.green : V.amber, fontSize: 8, lineHeight: 1.45 }}>
                            {relativeAircraftTelemetry
                              ? `${relativeAircraftTelemetry.source.toUpperCase()} feed · ${relativeAircraftTelemetry.ageMs} ms old${relativeAircraftTelemetry.stale ? " · STALE — capture locked" : " · LIVE"}`
                              : "No aircraft telemetry received. Capture is locked in aircraft mode."}
                          </div>
                        </div>
                      )}
                      <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 8 }}>
                        DOMINIC now accepts aircraft latitude/longitude, relative altitude, heading and gimbal pitch through one normalized telemetry model. Device GPS and the simulator exercise the same adapter that a DJI bridge can feed next.
                      </div>
                    </div>

                    <div style={{ border: `1px solid ${guidance?.ready ? "rgba(112,214,160,.45)" : "rgba(244,90,30,.25)"}`, borderRadius: 10, background: guidance?.ready ? "rgba(112,214,160,.07)" : "rgba(244,90,30,.05)", padding: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ color: guidance?.ready ? V.green : V.orange, fontSize: 9, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
                            {guidance?.ready ? "Capture ready" : "Guidance correction"}
                          </div>
                          <div style={{ color: V.text, fontSize: 14, fontWeight: 900, marginTop: 4 }}>
                            {guidance?.instruction ?? "Waiting for checkpoint"}
                          </div>
                        </div>
                        <LocateFixed size={27} color={guidance?.ready ? V.green : V.orange} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 10 }}>
                        {[
                          ["Bearing", guidance?.bearingReady, guidance ? `${Math.abs(guidance.bearingErrorDeg).toFixed(0)}°` : "—"],
                          ["Distance", guidance?.distanceReady, guidance ? `${Math.abs(guidance.distanceErrorFt).toFixed(1)} ft` : "—"],
                          ["Camera", guidance?.cameraReady, guidance ? `${Math.abs(guidance.cameraAngleError).toFixed(0)}°` : "—"],
                        ].map(([label, ready, error]) => (
                          <div key={String(label)} style={{ border: `1px solid ${ready ? "rgba(112,214,160,.25)" : V.line}`, borderRadius: 8, background: "#0D1319", padding: "7px 8px" }}>
                            <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase" }}>{label}</div>
                            <div style={{ marginTop: 3, color: ready ? V.green : V.amber, fontSize: 11, fontWeight: 900 }}>{ready ? "IN RANGE" : error}</div>
                          </div>
                        ))}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, color: V.muted, fontSize: 9, marginTop: 9, cursor: "pointer" }}>
                        <input type="checkbox" checked={guidanceLock} onChange={(event) => setGuidanceLock(event.target.checked)} />
                        Guidance lock: require position/camera tolerance before capture confirmation.
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: 7, alignItems: "center", marginTop: 12 }}>
                    <button type="button" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 8, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer" }}><ChevronLeft size={16} /></button>
                    <button type="button" disabled={!captureAllowed} onClick={markCaptured} style={{ border: "none", background: captureAllowed ? `linear-gradient(90deg,${V.orangeDark},${V.orange})` : "#39424B", color: captureAllowed ? "#180A02" : "#88939E", borderRadius: 8, padding: "10px 13px", fontWeight: 900, cursor: captureAllowed ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6 }}><Check size={15} /> Captured</button>
                    <div style={{ height: 5, background: "#222C35", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.round((capturedCount / plan.totalShots) * 100)}%`, height: "100%", background: V.orange }} /></div>
                    <button type="button" disabled={!safetyReady} onClick={markSkipped} style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.amber, borderRadius: 8, padding: "9px 10px", fontSize: 10, fontWeight: 800, cursor: safetyReady ? "pointer" : "not-allowed" }}>Skip / gap</button>
                    <button type="button" onClick={() => setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1))} style={{ border: `1px solid ${V.line}`, background: V.panel2, color: V.text, borderRadius: 8, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer" }}><ChevronRight size={16} /></button>
                  </div>
                </div>
              ) : null}
            </section>
          </main>

          <aside style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid rgba(244,90,30,.28)`, borderRadius: 12, background: "rgba(244,90,30,.055)", padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>Autonomous mission engine</div>
                  <div style={{ color: V.text, fontSize: 12, fontWeight: 900, marginTop: 3 }}>
                    {autonomousTarget === "connected"
                      ? autonomousMode === "repair"
                        ? "Connected-aircraft repair mission"
                        : "Connected-aircraft autonomous mission"
                      : autonomousMode === "repair"
                        ? "Adaptive repair mission test"
                        : "Virtual aircraft end-to-end test"}
                  </div>
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: 3 }}>
                  <span style={{ color: autonomousSnapshot?.phase === "COMPLETE" ? V.green : autonomousSnapshot?.phase === "FAILED" ? "#FF8B7A" : V.muted, fontSize: 9, fontWeight: 900 }}>
                    {autonomousSnapshot?.phase ?? "IDLE"}
                  </span>
                  <span style={{ color: flightAuditStatus === "saved" ? V.green : flightAuditStatus === "error" ? V.amber : V.muted, fontSize: 7, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>
                    Audit {flightAuditStatus}{lastFlightRunId ? ` · ${lastFlightRunId.slice(0, 8)}` : ""}
                  </span>
                </div>
              </div>
              <p style={{ color: V.muted, fontSize: 9, lineHeight: 1.45 }}>
                Runs this exact Object Scan through DOMINIC's universal aircraft interface: connect, preflight, arm, takeoff, fly every checkpoint, aim, capture, return home and land.
              </p>
              <div style={{ border: `1px solid ${autonomousSnapshot?.safetyIssues.length ? "rgba(255,184,107,.28)" : "rgba(112,214,160,.18)"}`, background: autonomousSnapshot?.safetyIssues.length ? "rgba(255,184,107,.05)" : "rgba(112,214,160,.04)", borderRadius: 8, padding: 8, marginBottom: 9 }}>
                <div style={{ color: autonomousSnapshot?.safetyIssues.length ? V.amber : V.green, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Flight safety supervisor · {autonomousSnapshot?.safetyIssues.length ? `${autonomousSnapshot.safetyIssues.length} active issue${autonomousSnapshot.safetyIssues.length === 1 ? "" : "s"}` : "clear"}
                </div>
                {autonomousSnapshot?.safetyIssues.length ? (
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    {autonomousSnapshot.safetyIssues.slice(0, 4).map((issue) => (
                      <div key={issue.code} style={{ color: issue.severity === "critical" ? "#FFB6AA" : "#FFD0A0", fontSize: 8, lineHeight: 1.4 }}>
                        {issue.action.replace("_", " ").toUpperCase()} · {issue.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 4 }}>
                    DOMINIC continuously evaluates link freshness, battery, GNSS, optional RTK policy, aircraft failsafe state, and obstacle alerts while autonomous execution is active.
                  </div>
                )}
              </div>
              <div style={{ border: `1px solid rgba(255,184,107,.22)`, background: "rgba(255,184,107,.04)", borderRadius: 8, padding: 8, marginBottom: 9 }}>
                <div style={{ color: V.amber, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Safety Scenario Lab
                </div>
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 4 }}>
                  Inject a deterministic failure into the virtual aircraft and verify DOMINIC responds before any hardware test.
                </div>
                <select
                  value={safetyScenario}
                  disabled={autonomousRunning}
                  onChange={(event) => setSafetyScenario(event.target.value as SafetyScenario)}
                  style={{ width: "100%", marginTop: 7, border: `1px solid ${V.line}`, background: "#0D1319", color: V.text, borderRadius: 7, padding: "7px 8px", fontSize: 8 }}
                >
                  {Object.entries(safetyScenarioLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!preflightReady || autonomousRunning}
                  onClick={() => void runSafetyScenario()}
                  style={{ width: "100%", marginTop: 7, border: `1px solid rgba(255,184,107,.28)`, background: "#0D1319", color: V.amber, borderRadius: 7, padding: "7px 8px", fontSize: 8, fontWeight: 900, cursor: preflightReady && !autonomousRunning ? "pointer" : "not-allowed" }}
                >
                  Run Safety Scenario
                </button>
                {safetyScenarioResult ? (
                  <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 6 }}>
                    {safetyScenarioResult}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                disabled={!preflightReady || autonomousRunning}
                onClick={() => runAutonomousSimulation("full")}
                style={{
                  width: "100%",
                  border: 0,
                  borderRadius: 8,
                  padding: "9px 10px",
                  background: preflightReady && !autonomousRunning ? `linear-gradient(90deg,${V.orangeDark},${V.orange})` : "#39424B",
                  color: preflightReady && !autonomousRunning ? "#180A02" : "#88939E",
                  fontWeight: 900,
                  cursor: preflightReady && !autonomousRunning ? "pointer" : "not-allowed",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                }}
              >
                {autonomousRunning ? <Square size={12} /> : <Play size={12} />}
                {autonomousRunning
                  ? autonomousTarget === "simulator"
                    ? "Simulation running..."
                    : "Mission in progress..."
                  : "Run Full Autonomous Simulation"}
              </button>

              <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 10, paddingTop: 10 }}>
                <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Connected aircraft execution</div>
                <label style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 7, alignItems: "start", color: bridgeStatus === "connected" ? "#DCE3EA" : V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 7, cursor: bridgeStatus === "connected" ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    disabled={
                      bridgeStatus !== "connected" ||
                      !preflightReady ||
                      !productionFlightUnlocked ||
                      autonomousRunning
                    }
                    checked={realFlightApproved}
                    onChange={(event) =>
                      setRealFlightApprovalSignature(
                        event.target.checked ? realFlightPlanSignature : null,
                      )
                    }
                  />
                  <span>
                    I confirm the connected aircraft, home/RTH point, airspace, people/obstacles, and this displayed capture plan are safe for autonomous execution.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    bridgeStatus !== "connected" ||
                    !preflightReady ||
                    !productionFlightUnlocked ||
                    !realFlightApproved ||
                    autonomousRunning
                  }
                  onClick={() => runConnectedAircraftMission("full")}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    border: `1px solid ${realFlightApproved ? "rgba(112,214,160,.35)" : V.line}`,
                    borderRadius: 8,
                    padding: "9px 10px",
                    background:
                      bridgeStatus === "connected" && preflightReady && realFlightApproved && !autonomousRunning
                        ? "rgba(112,214,160,.12)"
                        : "#1B222A",
                    color:
                      bridgeStatus === "connected" && preflightReady && realFlightApproved && !autonomousRunning
                        ? V.green
                        : "#6F7A84",
                    fontWeight: 900,
                    cursor:
                      bridgeStatus === "connected" && preflightReady && realFlightApproved && !autonomousRunning
                        ? "pointer"
                        : "not-allowed",
                    fontSize: 9,
                  }}
                >
                  Execute Object Scan on Connected Aircraft
                </button>
              </div>
              {autonomousRunning && autonomousSnapshot ? (
                <div style={{ borderTop: `1px solid ${V.line}`, marginTop: 10, paddingTop: 10 }}>
                  <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Live mission controls</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 7 }}>
                    <button
                      type="button"
                      disabled={
                        !["TRANSIT", "AIMING", "CAPTURING"].includes(autonomousSnapshot.phase) ||
                        (autonomousTarget === "connected" && !bridgeInfo?.capabilities.pauseResume)
                      }
                      onClick={() => void pauseActiveMission()}
                      style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.amber, borderRadius: 7, padding: "7px 6px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      disabled={
                        autonomousSnapshot.phase !== "PAUSED" ||
                        (autonomousTarget === "connected" && !bridgeInfo?.capabilities.pauseResume)
                      }
                      onClick={() => void resumeActiveMission()}
                      style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.green, borderRadius: 7, padding: "7px 6px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => void abortActiveMission()}
                      style={{ border: "1px solid rgba(255,139,122,.35)", background: "rgba(255,139,122,.08)", color: "#FFB6AA", borderRadius: 7, padding: "7px 6px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                    >
                      Abort / Recover
                    </button>
                  </div>
                  {missionControlMessage ? (
                    <div style={{ color: autonomousSnapshot.safetyIssues.length ? V.amber : V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 6 }}>
                      {missionControlMessage}
                    </div>
                  ) : null}
                  {autonomousTarget === "connected" && !bridgeInfo?.capabilities.pauseResume ? (
                    <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 5 }}>
                      This aircraft adapter does not expose pause/resume. Abort/recovery remains available.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {autonomousSnapshot ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 9 }}>
                    <div style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: 8 }}>
                      <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>Checkpoints</div>
                      <div style={{ color: V.text, fontSize: 13, fontWeight: 900, marginTop: 3 }}>{autonomousSnapshot.completedCheckpointIds.length}/{autonomousSnapshot.checkpointCount}</div>
                    </div>
                    <div style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: 8 }}>
                      <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>Aircraft</div>
                      <div style={{ color: V.text, fontSize: 11, fontWeight: 900, marginTop: 3 }}>{autonomousSnapshot.lastAircraftState?.flightMode ?? "—"}</div>
                    </div>
                  </div>
                  <div style={{ maxHeight: 130, overflowY: "auto", marginTop: 8, display: "grid", gap: 4 }}>
                    {autonomousSnapshot.events.slice(-10).reverse().map((event, index) => (
                      <div key={`${event.atMs}-${event.phase}-${index}`} style={{ color: event.phase === "FAILED" ? "#FF8B7A" : V.muted, fontSize: 8, lineHeight: 1.35 }}>
                        <strong style={{ color: event.phase === "COMPLETE" ? V.green : V.text }}>{event.phase}</strong> · {event.message}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ color: V.text, fontSize: 12, fontWeight: 900 }}>Flight audit history</div>
                  <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>Persistent pilot-owned DOMINIC execution records</div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadRecentFlightRuns()}
                  disabled={flightHistoryLoading}
                  style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: flightHistoryLoading ? "not-allowed" : "pointer" }}
                >
                  {flightHistoryLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
                {recentFlightRuns.length ? recentFlightRuns.map((run) => (
                  <div key={run.id} style={{ border: `1px solid ${V.line}`, background: "#0D1319", borderRadius: 8, padding: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong style={{ color: V.text, fontSize: 9 }}>
                        {run.mission_type.toUpperCase()} · {run.aircraft_model ?? run.aircraft_vendor ?? "Aircraft"}
                      </strong>
                      <span style={{ color: run.status === "complete" ? V.green : run.status === "failed" ? "#FF8B7A" : run.status === "aborted" ? V.amber : V.muted, fontSize: 7, fontWeight: 900, textTransform: "uppercase" }}>
                        {run.status}
                      </span>
                    </div>
                    <div style={{ color: V.muted, fontSize: 8, marginTop: 4 }}>
                      {new Date(run.started_at ?? run.created_at).toLocaleString()}
                      {typeof run.coverage_summary?.coveragePct === "number" ? ` · coverage ${run.coverage_summary.coveragePct}%` : ""}
                      {run.payload_snapshot?.name ? ` · ${run.payload_snapshot.name}` : ""}
                    </div>
                    <div style={{ color: "#66727D", fontSize: 7, marginTop: 3, fontFamily: "monospace" }}>{run.id}</div>
                  </div>
                )) : (
                  <div style={{ color: V.muted, fontSize: 9, lineHeight: 1.45 }}>
                    Refresh to load your recent DOMINIC flight records. New autonomous runs are saved here automatically.
                  </div>
                )}
              </div>
            </section>

            <section style={{ border: `1px solid ${adaptiveCoverage.missing ? "rgba(255,184,107,.28)" : "rgba(112,214,160,.22)"}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ color: V.text, fontSize: 12, fontWeight: 900 }}>Adaptive coverage</div>
                  <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>Captured pose + image quality vs planned views</div>
                </div>
                <div style={{ color: adaptiveCoverage.coveragePct >= 90 ? V.green : adaptiveCoverage.coveragePct >= 70 ? V.amber : "#FF8B7A", fontSize: 18, fontWeight: 900 }}>
                  {adaptiveCoverage.coveragePct}%
                </div>
              </div>

              <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {[
                  ["Covered", adaptiveCoverage.covered, V.green],
                  ["Weak", adaptiveCoverage.weak, V.amber],
                  ["Missing", adaptiveCoverage.missing, "#FF8B7A"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: 8 }}>
                    <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: String(color), marginTop: 3 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 9, display: "grid", gap: 5 }}>
                {Object.entries(coverageByRing).map(([ring, stats]) => (
                  <div key={ring} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, border: `1px solid ${V.line}`, borderRadius: 7, background: "#0D1319", padding: "6px 7px" }}>
                    <span style={{ color: "#DCE3EA", fontSize: 9, textTransform: "capitalize" }}>{ring} ring</span>
                    <span style={{ color: V.muted, fontSize: 8 }}>{stats.covered} good · {stats.weak} weak · {stats.missing} missing</span>
                  </div>
                ))}
              </div>

              <p style={{ color: V.muted, fontSize: 9, lineHeight: 1.5 }}>
                DOMINIC now evaluates whether each planned view was actually captured from the right location, altitude and camera angle, then factors in image-quality scores. Weak or missing views become a repair pass instead of forcing a complete reflown mission.
              </p>
              <div style={{ border: `1px solid ${V.line}`, borderRadius: 9, background: "#0D1319", padding: 9, marginTop: 8 }}>
                <div style={{ color: V.orange, fontSize: 8, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Analyze actual capture</div>
                <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.4, marginTop: 4 }}>
                  Select the image for the current checkpoint. DOMINIC measures sharpness, exposure, contrast and clipping locally in the browser, then feeds the scores into adaptive coverage.
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={imageAnalysisStatus === "analyzing"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void analyzeCapturedImage(file);
                    event.currentTarget.value = "";
                  }}
                  style={{ width: "100%", marginTop: 7, color: V.muted, fontSize: 8 }}
                />
                {imageAnalysisStatus === "analyzing" ? <div style={{ color: V.amber, fontSize: 8, marginTop: 6 }}>Analyzing image pixels…</div> : null}
                {lastImageQuality ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 7 }}>
                    {[
                      ["Sharpness", Math.round(lastImageQuality.sharpnessScore * 100) + "%"],
                      ["Exposure", Math.round(lastImageQuality.exposureScore * 100) + "%"],
                      ["Megapixels", lastImageQuality.megapixels.toFixed(1)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ border: `1px solid ${V.line}`, borderRadius: 7, padding: 6, background: V.panel2 }}>
                        <div style={{ color: V.muted, fontSize: 7, textTransform: "uppercase" }}>{label}</div>
                        <div style={{ color: V.text, fontSize: 10, fontWeight: 900, marginTop: 2 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {imageAnalysisMessage ? (
                  <div style={{ color: imageAnalysisStatus === "error" ? "#FF8B7A" : lastImageQuality?.usable ? V.green : V.amber, fontSize: 8, lineHeight: 1.4, marginTop: 6 }}>
                    {imageAnalysisMessage}
                  </div>
                ) : null}
              </div>

              {captureObservations.length ? (
                <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 8, marginTop: 8 }}>
                  <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: ".08em" }}>Captured image quality test</div>
                  <div style={{ display: "grid", gap: 5, marginTop: 6, maxHeight: 110, overflowY: "auto" }}>
                    {captureObservations.slice(-8).reverse().map((observation) => {
                      const checkpoint = sequence.find((item) => item.id === observation.checkpointId);
                      const quality = Math.min(observation.sharpnessScore ?? 1, observation.exposureScore ?? 1);
                      return (
                        <div key={observation.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 5, alignItems: "center", color: V.muted, fontSize: 8 }}>
                          <span>{checkpoint?.ringLabel ?? observation.checkpointId} · {checkpoint ? `frame ${checkpoint.shotNumber}` : ""}</span>
                          <span style={{ color: quality >= .72 ? V.green : quality >= .55 ? V.amber : "#FF8B7A", fontWeight: 900 }}>{Math.round(quality * 100)}%</span>
                          <button
                            type="button"
                            onClick={() => setObservationQuality(observation.checkpointId ?? "", quality >= .72 ? .6 : .95)}
                            style={{ border: `1px solid ${V.line}`, background: "#151D25", color: V.text, borderRadius: 6, padding: "3px 5px", fontSize: 7, cursor: "pointer" }}
                          >
                            {quality >= .72 ? "Sim weak" : "Restore"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 9, marginTop: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div>
                    <div style={{ color: V.orange, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Repair pass</div>
                    <div style={{ color: V.muted, fontSize: 8, marginTop: 2 }}>{repairPlan.length} checkpoint{repairPlan.length === 1 ? "" : "s"} require recapture.</div>
                  </div>
                  {repairPlan.length ? (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const first = repairPlan[0];
                          const index = sequence.findIndex((item) => item.id === first.sourceCheckpointId);
                          if (index >= 0) setCurrentIndex(index);
                        }}
                        style={{ border: `1px solid rgba(244,90,30,.3)`, background: "rgba(244,90,30,.08)", color: "#FFD3C0", borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: "pointer" }}
                      >
                        Manual repair
                      </button>
                      <button
                        type="button"
                        disabled={!preflightReady || autonomousRunning}
                        onClick={() => runAutonomousSimulation("repair")}
                        style={{
                          border: 0,
                          background: preflightReady && !autonomousRunning ? `linear-gradient(90deg,${V.orangeDark},${V.orange})` : "#39424B",
                          color: preflightReady && !autonomousRunning ? "#180A02" : "#88939E",
                          borderRadius: 7,
                          padding: "6px 8px",
                          fontSize: 8,
                          fontWeight: 900,
                          cursor: preflightReady && !autonomousRunning ? "pointer" : "not-allowed",
                        }}
                      >
                        Simulate repair
                      </button>
                      {bridgeStatus === "connected" ? (
                        <button
                          type="button"
                          disabled={!realFlightApproved || !preflightReady || autonomousRunning}
                          onClick={() => runConnectedAircraftMission("repair")}
                          style={{ border: `1px solid rgba(112,214,160,.3)`, background: realFlightApproved ? "rgba(112,214,160,.08)" : "#1B222A", color: realFlightApproved ? V.green : "#6F7A84", borderRadius: 7, padding: "6px 8px", fontSize: 8, fontWeight: 900, cursor: realFlightApproved ? "pointer" : "not-allowed" }}
                        >
                          Fly repair
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div style={{ maxHeight: 160, overflowY: "auto", display: "grid", gap: 5, marginTop: 7 }}>
                  {repairPlan.length ? repairPlan.slice(0, 18).map((repair) => {
                    const shot = sequence.find((item) => item.id === repair.sourceCheckpointId);
                    const assessment = adaptiveCoverage.assessments.find((item) => item.checkpointId === repair.sourceCheckpointId);
                    return (
                      <button
                        key={repair.id}
                        type="button"
                        onClick={() => {
                          const index = sequence.findIndex((item) => item.id === repair.sourceCheckpointId);
                          if (index >= 0) setCurrentIndex(index);
                        }}
                        style={{
                          border: `1px solid ${repair.priority === 2 ? "rgba(255,139,122,.25)" : "rgba(255,184,107,.22)"}`,
                          background: repair.priority === 2 ? "rgba(255,139,122,.05)" : "rgba(255,184,107,.05)",
                          color: repair.priority === 2 ? "#FFB6AA" : "#FFD0A0",
                          borderRadius: 7,
                          padding: "6px 7px",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: 8,
                          lineHeight: 1.35,
                        }}
                      >
                        <strong>{assessment?.status === "weak" ? "WEAK" : "MISSING"}</strong> · {shot?.ringLabel} frame {shot?.shotNumber} · {shot?.bearingDeg}°
                      </button>
                    );
                  }) : (
                    <div style={{ color: V.green, fontSize: 9, display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={13} /> Planned views satisfy the current coverage policy.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ color: V.text, fontSize: 12, fontWeight: 900 }}>Plan warnings</div>
              <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                {plan.warnings.length ? plan.warnings.map((warning) => (
                  <div key={warning} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 6, color: "#FFD0A0", background: "rgba(255,184,107,.06)", border: `1px solid rgba(255,184,107,.18)`, borderRadius: 8, padding: 8, fontSize: 9, lineHeight: 1.45 }}>
                    <AlertTriangle size={13} color={V.amber} /> <span>{warning}</span>
                  </div>
                )) : <div style={{ color: V.green, fontSize: 10, display: "flex", gap: 6, alignItems: "center" }}><CheckCircle2 size={13} /> Geometry is within the default planning envelope.</div>}
              </div>
            </section>

            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: "rgba(244,90,30,.07)", padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: V.orange, fontSize: 9, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}><Gauge size={12} /> Autonomy-ready structure</div>
              <p style={{ color: "#C9D2DA", fontSize: 10, lineHeight: 1.55, marginBottom: 8 }}>
                Manual guidance and future autonomous flight now share the exact same checkpoint list. Every point contains ring, sequence, bearing, radius, geographic coordinates, relative altitude, gimbal angle and capture action.
              </p>
              <button type="button" onClick={downloadCheckpointPayload} style={{ width: "100%", border: `1px solid rgba(244,90,30,.28)`, background: "rgba(244,90,30,.08)", color: "#FFD3C0", borderRadius: 8, padding: "8px 9px", fontSize: 9, fontWeight: 800, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                <Download size={12} /> Download waypoint payload
              </button>
            </section>
          </aside>
        </div>
      )}
      </div>
    </div>
  );
}
