"use client";

import { useMemo, useState } from "react";
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
  LocateFixed,
  MapPinned,
  Navigation,
  Radio,
  RotateCcw,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  buildAutonomousCheckpoints,
  buildCaptureSequence,
  buildGeographicCheckpoints,
  calculateObjectScanPlan,
  evaluateCaptureGuidance,
  missionProfiles,
  type CaptureMissionType,
} from "@/lib/capturePlanner";

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

export default function DominicCapturePlanner() {
  const [missionType, setMissionType] = useState<CaptureMissionType>("object");
  const [objectDiameterFt, setObjectDiameterFt] = useState(12);
  const [objectHeightFt, setObjectHeightFt] = useState(10);
  const [standoffFt, setStandoffFt] = useState(18);
  const [overlapPct, setOverlapPct] = useState(75);
  const [horizontalFovDeg, setHorizontalFovDeg] = useState(84);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [captured, setCaptured] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [safety, setSafety] = useState<Record<number, boolean>>({});
  const [telemetryBearingDeg, setTelemetryBearingDeg] = useState(0);
  const [telemetryDistanceFt, setTelemetryDistanceFt] = useState(24);
  const [telemetryCameraAngle, setTelemetryCameraAngle] = useState(5);
  const [guidanceLock, setGuidanceLock] = useState(false);
  const [centerLatitude, setCenterLatitude] = useState(39.95);
  const [centerLongitude, setCenterLongitude] = useState(-75.16);
  const [baseRelativeAltitudeFt, setBaseRelativeAltitudeFt] = useState(0);

  const plan = useMemo(
    () => calculateObjectScanPlan({ objectDiameterFt, objectHeightFt, standoffFt, overlapPct, horizontalFovDeg }),
    [objectDiameterFt, objectHeightFt, standoffFt, overlapPct, horizontalFovDeg],
  );
  const sequence = useMemo(() => buildCaptureSequence(plan), [plan]);
  const current = sequence[Math.min(currentIndex, sequence.length - 1)];
  const safetyReady = safetyItems.every((_, index) => safety[index]);
  const capturedCount = sequence.filter((shot) => captured[shot.id]).length;
  const skippedShots = sequence.filter((shot) => skipped[shot.id]);
  const outstandingShots = sequence.filter((shot, index) => index < currentIndex && !captured[shot.id] && !skipped[shot.id]);
  const gaps = [...skippedShots, ...outstandingShots.filter((shot) => !skipped[shot.id])];
  const guidance = current
    ? evaluateCaptureGuidance(
        current,
        {
          bearingDeg: telemetryBearingDeg,
          distanceFt: telemetryDistanceFt,
          cameraAngle: telemetryCameraAngle,
        },
        { bearingDeg: 5, distanceFt: 3, cameraAngle: 4 },
      )
    : null;
  const captureAllowed = safetyReady && (!guidanceLock || Boolean(guidance?.ready));

  const resetRun = () => {
    setCurrentIndex(0);
    setCaptured({});
    setSkipped({});
  };

  const markCaptured = () => {
    if (!current) return;
    setCaptured((state) => ({ ...state, [current.id]: true }));
    setSkipped((state) => {
      const next = { ...state };
      delete next[current.id];
      return next;
    });
    setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1));
  };

  const markSkipped = () => {
    if (!current) return;
    setSkipped((state) => ({ ...state, [current.id]: true }));
    setCaptured((state) => {
      const next = { ...state };
      delete next[current.id];
      return next;
    });
    setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1));
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
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dominic-object-scan-checkpoints.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

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
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(280px,.8fr)", gap: 14 }}>
          <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 18 }}>
            <div style={{ color: V.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>{activeProfile.label}</div>
            <h2 style={{ margin: "8px 0 6px", fontSize: 22 }}>Manual capture pattern</h2>
            <p style={{ color: V.muted, fontSize: 12, lineHeight: 1.6, maxWidth: 720 }}>{activeProfile.summary}</p>
            <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
              {manualGuidance[missionType as Exclude<CaptureMissionType, "object">].map((item, index) => (
                <div key={item} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 9, alignItems: "start", border: `1px solid ${V.line}`, borderRadius: 9, padding: 10, background: "#0D1319" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: V.orange, color: "#180A02", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900 }}>{index + 1}</span>
                  <span style={{ color: "#DCE3EA", fontSize: 12, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </section>
          <aside style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 18 }}>
            <Target size={25} color={V.orange} />
            <h3 style={{ margin: "10px 0 6px", fontSize: 16 }}>Shared planning engine</h3>
            <p style={{ margin: 0, color: V.muted, fontSize: 11, lineHeight: 1.6 }}>
              This mission type already lives inside the Capture Planner and uses a defined manual capture pattern. Object Scan is the first pattern with full calculated checkpoints, live progress and gap tracking; the same engine will be extended to calculate this pattern geometrically.
            </p>
          </aside>
        </div>
      ) : (
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
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: V.text, fontSize: 10, fontWeight: 900 }}>
                          <Radio size={13} color={guidance?.ready ? V.green : V.orange} /> Relative telemetry
                        </div>
                        <button type="button" onClick={snapTelemetryToCheckpoint} style={{ border: `1px solid ${V.line}`, background: "#0D1319", color: V.muted, borderRadius: 7, padding: "5px 7px", fontSize: 8, cursor: "pointer" }}>
                          Simulate on target
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 9 }}>
                        <Field label="Bearing" value={telemetryBearingDeg} min={0} max={359} suffix="deg" onChange={setTelemetryBearingDeg} />
                        <Field label="Radius" value={telemetryDistanceFt} min={1} max={500} step={0.5} suffix="ft" onChange={setTelemetryDistanceFt} />
                        <Field label="Camera" value={telemetryCameraAngle} min={-90} max={30} suffix="deg" onChange={setTelemetryCameraAngle} />
                      </div>
                      <div style={{ color: V.muted, fontSize: 8, lineHeight: 1.45, marginTop: 8 }}>
                        Manual telemetry/simulator in this build. DJI/controller telemetry will feed these same three values later.
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
            <section style={{ border: `1px solid ${V.line}`, borderRadius: 12, background: V.panel, padding: 13 }}>
              <div style={{ color: V.text, fontSize: 12, fontWeight: 900 }}>Coverage & gaps</div>
              <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <div style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: 9 }}>
                  <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase" }}>Captured</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: V.green, marginTop: 3 }}>{capturedCount}</div>
                </div>
                <div style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: "#0D1319", padding: 9 }}>
                  <div style={{ color: V.muted, fontSize: 8, textTransform: "uppercase" }}>Open gaps</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: gaps.length ? V.amber : V.green, marginTop: 3 }}>{gaps.length}</div>
                </div>
              </div>
              <p style={{ color: V.muted, fontSize: 10, lineHeight: 1.5 }}>
                Gap detection compares the planned checkpoint set with frames you mark captured. Skipped or passed checkpoints remain visible for a repair pass.
              </p>
              <div style={{ maxHeight: 170, overflowY: "auto", display: "grid", gap: 5 }}>
                {gaps.length ? gaps.slice(0, 18).map((shot) => (
                  <button key={shot.id} type="button" onClick={() => setCurrentIndex(sequence.findIndex((item) => item.id === shot.id))} style={{ border: `1px solid rgba(255,184,107,.22)`, background: "rgba(255,184,107,.06)", color: "#FFD0A0", borderRadius: 7, padding: "6px 7px", textAlign: "left", cursor: "pointer", fontSize: 9 }}>
                    {shot.ringLabel} · frame {shot.shotNumber} · {shot.bearingDeg}°
                  </button>
                )) : <div style={{ color: V.green, fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={13} /> No detected plan gaps.</div>}
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
