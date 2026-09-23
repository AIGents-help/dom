"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Crosshair,
  Download,
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
import { WebSocketFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { connectFlightBridgeAdapter } from "@/lib/aircraft/bridgeConnect";
import type { DominicAircraftAdapter, AircraftCapabilities } from "@/lib/aircraft/contract";
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
} from "@/lib/capturePatterns";
import {
  DominicMissionEngine,
  type MissionExecutionSnapshot,
} from "@/lib/aircraft/missionEngine";

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

export default function DominicCapturePlanner() {
  const [missionType, setMissionType] = useState<CaptureMissionType>("object");
  const [objectDiameterFt, setObjectDiameterFt] = useState(12);
  const [objectHeightFt, setObjectHeightFt] = useState(10);
  const [standoffFt, setStandoffFt] = useState(18);
  const [overlapPct, setOverlapPct] = useState(75);
  const [horizontalFovDeg, setHorizontalFovDeg] = useState(84);
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
  const [autonomousSnapshot, setAutonomousSnapshot] = useState<MissionExecutionSnapshot | null>(null);
  const [autonomousRunning, setAutonomousRunning] = useState(false);
  const [autonomousMode, setAutonomousMode] = useState<"full" | "repair">("full");
  const [bridgeUrl, setBridgeUrl] = useState("ws://127.0.0.1:8787");
  const [bridgeStatus, setBridgeStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeInfo, setBridgeInfo] = useState<{
    vendor: string;
    model?: string;
    aircraftId: string;
    capabilities: AircraftCapabilities;
  } | null>(null);
  const bridgeAdapterRef = useRef<DominicAircraftAdapter | null>(null);
  const bridgeUnsubscribeRef = useRef<(() => void) | null>(null);

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

  const coverageByRing = useMemo(
    () => summarizeCoverageByRing(geographicCheckpoints, adaptiveCoverage),
    [geographicCheckpoints, adaptiveCoverage],
  );

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
      setBridgeInfo({
        vendor: hello.vendor,
        model: hello.model,
        aircraftId: hello.aircraftId,
        capabilities: hello.capabilities,
      });
      setTelemetryMode("aircraft");
      setBridgeStatus("connected");
    } catch (error) {
      setBridgeStatus("error");
      setBridgeError(error instanceof Error ? error.message : "Unable to connect to Flight Bridge.");
    }
  };

  const disconnectAircraftBridge = async () => {
    bridgeUnsubscribeRef.current?.();
    bridgeUnsubscribeRef.current = null;
    const adapter = bridgeAdapterRef.current;
    bridgeAdapterRef.current = null;
    if (adapter) await adapter.disconnect();
    setBridgeInfo(null);
    setBridgeStatus("disconnected");
    setBridgeError(null);
  };

  const runAutonomousSimulation = async (
    mode: "full" | "repair" = "full",
  ) => {
    if (!preflightReady || autonomousRunning) return;
    const checkpoints =
      mode === "repair" ? repairPlan : geographicCheckpoints;
    if (!checkpoints.length) return;

    setAutonomousMode(mode);
    setAutonomousRunning(true);
    setAutonomousSnapshot(null);

    const aircraft = new SimulatorAircraftAdapter({
      latitude: homeLatitude,
      longitude: homeLongitude,
      homeLatitude,
      homeLongitude,
    });
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
    const unsubscribe = engine.subscribe((snapshot) => setAutonomousSnapshot(snapshot));
    await engine.execute();
    unsubscribe();
    setAutonomousSnapshot(engine.getSnapshot());
    setAutonomousRunning(false);
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
          verticalFovDeg: 60,
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
          verticalFovDeg: 60,
        });
      case "facade":
        return calculateFacadePlan({
          widthFt: patternWidthFt,
          heightFt: patternHeightFt,
          standoffFt: patternStandoffFt,
          overlapPct: patternOverlapPct,
          horizontalFovDeg,
          verticalFovDeg: 60,
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
          verticalFovDeg: 60,
        });
      case "corridor":
        return calculateCorridorPlan({
          lengthFt: patternLengthFt,
          widthFt: patternWidthFt,
          altitudeFt: patternAltitudeFt,
          frontOverlapPct: patternOverlapPct,
          sideOverlapPct: Math.max(40, patternOverlapPct - 10),
          horizontalFovDeg,
          verticalFovDeg: 60,
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
  ]);

  const activeProfile = missionProfiles[missionType];

  return (
    <div style={{ minHeight: 650, background: V.bg, color: V.text }}>
      <div style={{ padding: "18px 18px 12px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
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
        </div>
      </div>

      <div style={{ padding: 14, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", borderBottom: `1px solid ${V.line}` }}>
        {(Object.keys(missionProfiles) as CaptureMissionType[]).map((type) => {
          const profile = missionProfiles[type];
          const active = missionType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setMissionType(type)}
              style={{
                border: active ? `1px solid ${V.orange}` : `1px solid ${V.line}`,
                borderRadius: 9,
                background: active ? "rgba(244,90,30,.14)" : V.panel,
                color: active ? V.text : "#C6CFD8",
                padding: "9px 10px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 900 }}>{profile.label}</div>
              <div style={{ color: active ? "#FFAA88" : V.muted, fontSize: 8, marginTop: 3, letterSpacing: ".08em", textTransform: "uppercase" }}>
                {type === "object" ? "Interactive planner" : "Manual pattern"}
              </div>
            </button>
          );
        })}
      </div>

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
          </aside>

          <main style={{ display: "grid", gap: 12 }}>
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>Calculated capture pattern</div>
                  <div style={{ color: V.muted, fontSize: 10, marginTop: 3 }}>DOMINIC is generating real checkpoints for this mission type—not just instructions.</div>
                </div>
                <div style={{ color: V.green, fontSize: 9, fontWeight: 900 }}>GEOMETRY ACTIVE</div>
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
              <div style={{ marginTop: 9 }}>
                <Field label="Horizontal camera FOV" value={horizontalFovDeg} min={25} max={120} suffix="deg" onChange={setHorizontalFovDeg} />
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
                    {autonomousMode === "repair" ? "Adaptive repair mission test" : "Virtual aircraft end-to-end test"}
                  </div>
                </div>
                <span style={{ color: autonomousSnapshot?.phase === "COMPLETE" ? V.green : autonomousSnapshot?.phase === "FAILED" ? "#FF8B7A" : V.muted, fontSize: 9, fontWeight: 900 }}>
                  {autonomousSnapshot?.phase ?? "IDLE"}
                </span>
              </div>
              <p style={{ color: V.muted, fontSize: 9, lineHeight: 1.45 }}>
                Runs this exact Object Scan through DOMINIC's universal aircraft interface: connect, preflight, arm, takeoff, fly every checkpoint, aim, capture, return home and land.
              </p>
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
                {autonomousRunning ? "Simulation running..." : "Run Full Autonomous Simulation"}
              </button>
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
  );
}
