"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  BatteryCharging,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  Cpu,
  Drone,
  FileClock,
  Flame,
  Gauge,
  Orbit,
  Radio,
  Route,
  ShieldCheck,
  ThermometerSun,
  Wind,
} from "lucide-react";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const BG = "#0A1015";
const PANEL = "#10171E";
const PANEL_2 = "#131C24";
const LINE = "#26323D";
const TEXT = "#F5F7FA";
const MUTED = "#91A0AE";
const GREEN = "#64D69A";
const AMBER = "#FFB565";
const RED = "#FF7474";
const CYAN = "#63CBE8";

type HubView = "Command" | "Scheduler" | "Route Planner" | "Fleet" | "Sensors" | "Compliance";
type MissionType = "Surveillance" | "Thermal Inspection" | "LDAR" | "Emergency Recon";

const views: { label: HubView; icon: typeof Activity }[] = [
  { label: "Command", icon: Activity },
  { label: "Scheduler", icon: CalendarClock },
  { label: "Route Planner", icon: Route },
  { label: "Fleet", icon: Drone },
  { label: "Sensors", icon: Gauge },
  { label: "Compliance", icon: ShieldCheck },
];

const missionTypes: { label: MissionType; icon: typeof Activity; detail: string }[] = [
  { label: "Surveillance", icon: Camera, detail: "Perimeter, tank farm and asset patrol" },
  { label: "Thermal Inspection", icon: ThermometerSun, detail: "Hot spots, insulation loss and equipment screening" },
  { label: "LDAR", icon: Wind, detail: "Simulated gas-sensor route for leak detection workflows" },
  { label: "Emergency Recon", icon: Flame, detail: "Rapid visual/thermal response route" },
];

const routeNodes = [
  { id: "DOCK-1", x: 12, y: 74, label: "Dock Alpha" },
  { id: "TK-12", x: 28, y: 37, label: "Tank 12" },
  { id: "CRU-2", x: 49, y: 29, label: "Crude Unit" },
  { id: "FCC-1", x: 70, y: 43, label: "FCC" },
  { id: "FLR-3", x: 82, y: 21, label: "Flare 3" },
  { id: "PIPE-E", x: 79, y: 70, label: "East Pipe Rack" },
  { id: "DOCK-2", x: 53, y: 83, label: "Dock Bravo" },
];

const aircraft = [
  { id: "DOM-401", type: "Matrice 4T", dock: "Dock Alpha", battery: 94, status: "READY", payload: "RGB + Thermal" },
  { id: "DOM-402", type: "Matrice 4E", dock: "Dock Bravo", battery: 88, status: "READY", payload: "Mapping RGB" },
  { id: "DOM-403", type: "Enterprise Testbed", dock: "Maintenance Bay", battery: 61, status: "SERVICE", payload: "LDAR Sensor Interface" },
];

const initialAlerts = [
  { id: 1, level: "warning", title: "Wind advisory", detail: "Simulated east-sector gusts 19 mph. Review route altitude." },
  { id: 2, level: "info", title: "Tank 12 inspection due", detail: "Thermal recurring inspection window opens at 16:00." },
  { id: 3, level: "critical", title: "LDAR threshold simulation", detail: "Demo sensor exceeded configured methane threshold at PIPE-E." },
] as const;

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: PANEL, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function Header({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: "13px 15px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ color: ORANGE, fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase" }}>{eyebrow}</div>
        <div style={{ marginTop: 3, fontSize: 15, fontWeight: 900 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

function StatusPill({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "blue" }) {
  const colors = tone === "red" ? [RED, "rgba(255,116,116,.1)"] : tone === "amber" ? [AMBER, "rgba(255,181,101,.1)"] : tone === "blue" ? [CYAN, "rgba(99,203,232,.1)"] : [GREEN, "rgba(100,214,154,.1)"];
  return <span style={{ border: `1px solid ${colors[0]}55`, background: colors[1], color: colors[0], borderRadius: 999, padding: "4px 8px", fontSize: 9, fontWeight: 900, letterSpacing: ".08em" }}>{children}</span>;
}

function RefineryMap({ activeRoute = true }: { activeRoute?: boolean }) {
  const path = activeRoute ? routeNodes.slice(0, 6) : routeNodes.slice(0, 4);
  return (
    <div style={{ position: "relative", minHeight: 390, background: "radial-gradient(circle at 50% 45%, rgba(244,90,30,.09), transparent 36%), #0B1117", overflow: "hidden" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <pattern id="hub-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(255,255,255,.035)" strokeWidth=".2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#hub-grid)" />
        <rect x="18" y="19" width="18" height="29" rx="2" fill="rgba(145,160,174,.06)" stroke="rgba(145,160,174,.2)" />
        <rect x="42" y="18" width="15" height="22" rx="2" fill="rgba(145,160,174,.05)" stroke="rgba(145,160,174,.2)" />
        <rect x="61" y="31" width="18" height="24" rx="2" fill="rgba(145,160,174,.05)" stroke="rgba(145,160,174,.2)" />
        <path d="M8,66 C28,60 35,72 52,65 S77,58 93,68" fill="none" stroke="rgba(99,203,232,.19)" strokeWidth="2.5" />
        <path d="M10,79 L88,79" stroke="rgba(145,160,174,.18)" strokeWidth="3.5" />
        {activeRoute ? <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={ORANGE} strokeWidth=".75" strokeDasharray="2 1.2" /> : null}
        {routeNodes.map((node, index) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={index === 0 ? 2.2 : 1.45} fill={index === 0 ? GREEN : activeRoute && index < path.length ? ORANGE : "#8F9CAA"} />
            <circle cx={node.x} cy={node.y} r={index === 0 ? 4 : 2.8} fill="none" stroke={index === 0 ? "rgba(100,214,154,.45)" : "rgba(244,90,30,.24)"} strokeWidth=".35" />
          </g>
        ))}
      </svg>
      <div style={{ position: "absolute", left: 14, top: 14, display: "flex", gap: 7 }}>
        <StatusPill>SIMULATION</StatusPill>
        <StatusPill tone="blue">REFINERY DIGITAL TWIN</StatusPill>
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 12, right: 14, display: "flex", justifyContent: "space-between", color: MUTED, fontSize: 10 }}>
        <span>Monroe Energy · Training Environment</span>
        <span>Route nodes: {path.length} · Geofence loaded</span>
      </div>
      <div style={{ position: "absolute", right: 15, top: 14, border: `1px solid ${LINE}`, background: "rgba(8,13,18,.82)", padding: "8px 10px", borderRadius: 9, fontSize: 10 }}>
        <div style={{ color: MUTED }}>Active aircraft</div>
        <div style={{ color: TEXT, fontWeight: 900, marginTop: 2 }}>DOM-401 · 124 ft AGL</div>
      </div>
    </div>
  );
}

export default function DominicHub() {
  const [view, setView] = useState<HubView>("Command");
  const [missionType, setMissionType] = useState<MissionType>("LDAR");
  const [selectedAircraft, setSelectedAircraft] = useState("DOM-401");
  const [routeMode, setRouteMode] = useState<"Patrol" | "Thermal Sweep" | "LDAR East">("LDAR East");
  const [alerts, setAlerts] = useState(() => initialAlerts.map((a) => ({ ...a, ack: false })));
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  const selected = useMemo(() => aircraft.find((a) => a.id === selectedAircraft) ?? aircraft[0], [selectedAircraft]);

  const commandView = (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(300px,.8fr)", gap: 12 }}>
        <Panel>
          <Header eyebrow="Live Operation" title="Refinery Command Map" right={<StatusPill tone={simulationRunning ? "green" : "amber"}>{simulationRunning ? "SIM ACTIVE" : "PAUSED"}</StatusPill>} />
          <RefineryMap activeRoute={simulationRunning} />
        </Panel>
        <div style={{ display: "grid", gap: 12 }}>
          <Panel>
            <Header eyebrow="Mission" title="Current Assignment" />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{missionType}</div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>East Pipe Rack · Route {routeMode}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 13 }}>
                {[["Aircraft", selected.id], ["Battery", `${selected.battery}%`], ["Altitude", "124 ft"], ["ETA", "08:42"]].map(([k, v]) => (
                  <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 10px", background: PANEL_2 }}>
                    <div style={{ color: MUTED, fontSize: 8, fontWeight: 800 }}>{k}</div>
                    <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900 }}>{v}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setSimulationRunning((v) => !v)} style={{ width: "100%", marginTop: 12, border: 0, borderRadius: 9, padding: "10px 12px", background: simulationRunning ? "#28313A" : `linear-gradient(90deg,${ORANGE_DARK},${ORANGE})`, color: TEXT, fontWeight: 900, cursor: "pointer" }}>
                {simulationRunning ? "Pause Simulation" : "Start Simulated Mission"}
              </button>
            </div>
          </Panel>
          <Panel>
            <Header eyebrow="Telemetry" title="Sensor Snapshot" />
            <div style={{ padding: 12, display: "grid", gap: 8 }}>
              {[
                ["Thermal max", "141.6°F", ThermometerSun, AMBER],
                ["CH₄", "512 ppm", Wind, RED],
                ["Wind", "14 mph E", CloudSun, CYAN],
                ["Link", "98%", Radio, GREEN],
              ].map(([label, value, Icon, color]) => (
                <div key={String(label)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${LINE}`, padding: "7px 2px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", color: MUTED, fontSize: 11 }}><Icon size={15} color={String(color)} />{label}</div>
                  <div style={{ fontWeight: 900, fontSize: 12 }}>{value}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <Panel>
        <Header eyebrow="Operations" title="Alerts & Exceptions" right={<StatusPill tone={alerts.some((a) => a.level === "critical" && !a.ack) ? "red" : "green"}>{alerts.filter((a) => !a.ack).length} OPEN</StatusPill>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, padding: 12 }}>
          {alerts.map((alert) => (
            <button key={alert.id} onClick={() => setAlerts((items) => items.map((a) => a.id === alert.id ? { ...a, ack: true } : a))} style={{ textAlign: "left", border: `1px solid ${alert.ack ? LINE : alert.level === "critical" ? "rgba(255,116,116,.45)" : alert.level === "warning" ? "rgba(255,181,101,.4)" : "rgba(99,203,232,.35)"}`, background: alert.ack ? PANEL_2 : "#111921", borderRadius: 10, padding: 11, color: alert.ack ? MUTED : TEXT, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 900, fontSize: 11 }}>
                {alert.ack ? <CheckCircle2 size={15} color={GREEN} /> : <AlertTriangle size={15} color={alert.level === "critical" ? RED : alert.level === "warning" ? AMBER : CYAN} />}
                {alert.title}
              </div>
              <div style={{ fontSize: 9, lineHeight: 1.45, marginTop: 5, color: MUTED }}>{alert.detail}</div>
              <div style={{ fontSize: 8, fontWeight: 900, marginTop: 7, color: alert.ack ? GREEN : ORANGE }}>{alert.ack ? "ACKNOWLEDGED" : "CLICK TO ACKNOWLEDGE"}</div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );

  const schedulerView = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,.85fr) minmax(0,1.4fr)", gap: 12 }}>
      <Panel>
        <Header eyebrow="Mission Builder" title="Schedule Autonomous Route" />
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <label style={{ fontSize: 10, color: MUTED }}>Mission type</label>
          <div style={{ display: "grid", gap: 7 }}>
            {missionTypes.map(({ label, icon: Icon, detail }) => (
              <button key={label} onClick={() => setMissionType(label)} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 9, textAlign: "left", border: `1px solid ${missionType === label ? "rgba(244,90,30,.65)" : LINE}`, borderRadius: 10, background: missionType === label ? "rgba(244,90,30,.1)" : PANEL_2, color: TEXT, padding: 9, cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(244,90,30,.1)" }}><Icon size={16} color={ORANGE} /></div>
                <div><div style={{ fontWeight: 900, fontSize: 11 }}>{label}</div><div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>{detail}</div></div>
              </button>
            ))}
          </div>
          <label style={{ fontSize: 10, color: MUTED }}>Aircraft</label>
          <select value={selectedAircraft} onChange={(e) => setSelectedAircraft(e.target.value)} style={{ background: PANEL_2, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: 10 }}>
            {aircraft.map((a) => <option key={a.id}>{a.id}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${LINE}`, borderRadius: 9, padding: 10 }}>
            <span><span style={{ display: "block", fontSize: 11, fontWeight: 900 }}>Recurring schedule</span><span style={{ color: MUTED, fontSize: 8 }}>Mon / Wed / Fri · 06:00</span></span>
            <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
          </label>
          <button style={{ border: 0, borderRadius: 9, padding: "11px 12px", background: `linear-gradient(90deg,${ORANGE_DARK},${ORANGE})`, color: "#1B0902", fontWeight: 900, cursor: "pointer" }}>Save Simulation Schedule</button>
        </div>
      </Panel>
      <Panel>
        <Header eyebrow="Calendar" title="Upcoming Missions" />
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {[
            ["06:00", "LDAR East Pipe Rack", "DOM-401", "MON / WED / FRI", "Ready"],
            ["09:30", "Tank Farm Thermal Sweep", "DOM-401", "TUE / THU", "Ready"],
            ["13:00", "Perimeter Surveillance", "DOM-402", "DAILY", "Weather review"],
            ["16:00", "Tank 12 Thermal Inspection", "DOM-401", "TODAY", "Due"],
          ].map(([time, title, craft, repeat, status]) => (
            <div key={title} style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 100px 105px", gap: 10, alignItems: "center", border: `1px solid ${LINE}`, borderRadius: 10, padding: 11, background: PANEL_2 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{time}</div>
              <div><div style={{ fontSize: 11, fontWeight: 900 }}>{title}</div><div style={{ color: MUTED, fontSize: 8, marginTop: 3 }}>{craft} · {repeat}</div></div>
              <StatusPill tone={status === "Due" ? "amber" : status.includes("Weather") ? "blue" : "green"}>{status.toUpperCase()}</StatusPill>
              <button style={{ border: `1px solid ${LINE}`, background: "#0B1117", color: TEXT, borderRadius: 8, padding: "8px 9px", fontSize: 9, fontWeight: 800, cursor: "pointer" }}>Open Mission</button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );

  const plannerView = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(290px,.75fr)", gap: 12 }}>
      <Panel>
        <Header eyebrow="Route Planner" title="Refinery Waypoints & Geofences" right={<StatusPill tone="blue">SIMULATED</StatusPill>} />
        <RefineryMap />
      </Panel>
      <div style={{ display: "grid", gap: 12 }}>
        <Panel>
          <Header eyebrow="Route Preset" title={routeMode} />
          <div style={{ padding: 12, display: "grid", gap: 7 }}>
            {(["Patrol", "Thermal Sweep", "LDAR East"] as const).map((mode) => (
              <button key={mode} onClick={() => setRouteMode(mode)} style={{ border: `1px solid ${routeMode === mode ? "rgba(244,90,30,.65)" : LINE}`, background: routeMode === mode ? "rgba(244,90,30,.1)" : PANEL_2, color: TEXT, borderRadius: 9, padding: 10, textAlign: "left", fontWeight: 900, cursor: "pointer" }}>{mode}</button>
            ))}
          </div>
        </Panel>
        <Panel>
          <Header eyebrow="Constraints" title="Mission Envelope" />
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {[["Altitude", "120 ft AGL"], ["Max radius", "1.8 mi"], ["Return battery", "30%"], ["Geofence", "Refinery property"], ["Failsafe", "Return to dock"]].map(([k,v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${LINE}`, paddingBottom: 7, fontSize: 10 }}><span style={{ color: MUTED }}>{k}</span><strong>{v}</strong></div>)}
          </div>
        </Panel>
      </div>
    </div>
  );

  const fleetView = (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel>
        <Header eyebrow="Dock + Aircraft" title="Autonomous Fleet" right={<StatusPill>{aircraft.filter((a) => a.status === "READY").length} READY</StatusPill>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, padding: 12 }}>
          {aircraft.map((a) => (
            <button key={a.id} onClick={() => setSelectedAircraft(a.id)} style={{ textAlign: "left", border: `1px solid ${selectedAircraft === a.id ? "rgba(244,90,30,.7)" : LINE}`, background: selectedAircraft === a.id ? "rgba(244,90,30,.08)" : PANEL_2, borderRadius: 11, padding: 12, color: TEXT, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Drone size={23} color={ORANGE} /><StatusPill tone={a.status === "READY" ? "green" : "amber"}>{a.status}</StatusPill></div>
              <div style={{ fontSize: 17, fontWeight: 900, marginTop: 12 }}>{a.id}</div>
              <div style={{ color: MUTED, fontSize: 9, marginTop: 3 }}>{a.type}</div>
              <div style={{ marginTop: 12, display: "grid", gap: 5, fontSize: 9 }}><span><BatteryCharging size={12} style={{ verticalAlign: -2, marginRight: 5 }} />{a.battery}% battery</span><span><Archive size={12} style={{ verticalAlign: -2, marginRight: 5 }} />{a.dock}</span><span><Cpu size={12} style={{ verticalAlign: -2, marginRight: 5 }} />{a.payload}</span></div>
            </button>
          ))}
        </div>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
        {[["Dock Alpha","ONLINE","Charge 94% · Weather station healthy",GREEN],["Dock Bravo","ONLINE","Charge 88% · Door secured",GREEN],["Maintenance Bay","SERVICE","Sensor integration testbed",AMBER]].map(([name,status,detail,color]) => <Panel key={String(name)}><div style={{ padding: 13 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{name}</strong><span style={{ color: String(color), fontSize: 9, fontWeight: 900 }}>{status}</span></div><div style={{ color: MUTED, fontSize: 9, marginTop: 8 }}>{detail}</div></div></Panel>)}
      </div>
    </div>
  );

  const sensorsView = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
      {[
        ["Thermal Payload","Radiometric thermal simulation",ThermometerSun,[["Max temp","141.6°F"],["Min temp","78.2°F"],["Alarm","135°F"],["Calibration","Valid"]]],
        ["LDAR Sensor","Gas-sensor integration simulator",Wind,[["CH₄","512 ppm"],["VOC","16 ppm"],["Alarm","400 ppm"],["Pump","Nominal"]]],
        ["Visual Camera","Inspection imaging simulator",Camera,[["Mode","4K / 30"],["Zoom","3.0×"],["Storage","72% free"],["Stream","1080p"]]],
        ["Weather Station","Dock environmental feed",CloudSun,[["Wind","14 mph E"],["Gust","19 mph"],["Temp","79°F"],["Visibility","10+ mi"]]],
      ].map(([title,desc,Icon,items]) => <Panel key={String(title)}><Header eyebrow="Sensor" title={String(title)} right={<Icon size={19} color={ORANGE}/>} /><div style={{ padding: 13 }}><div style={{ color: MUTED, fontSize: 9, marginBottom: 10 }}>{String(desc)}</div>{(items as string[][]).map(([k,v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${LINE}`, fontSize: 10 }}><span style={{ color: MUTED }}>{k}</span><strong>{v}</strong></div>)}</div></Panel>)}
    </div>
  );

  const complianceView = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(300px,.8fr)", gap: 12 }}>
      <Panel>
        <Header eyebrow="Audit Trail" title="Mission & System Records" right={<StatusPill>LOGGING ON</StatusPill>} />
        <div style={{ padding: 12, display: "grid", gap: 7 }}>
          {[
            ["14:31:18","Mission simulation started","DOM-401 · LDAR East Pipe Rack","SYSTEM"],
            ["14:30:44","Preflight checks passed","Geofence · battery · link · weather","CHECK"],
            ["14:30:10","Route revision saved","Waypoint PIPE-E altitude changed 110 → 120 ft","USER"],
            ["14:29:22","Sensor threshold profile loaded","Methane alarm 400 ppm","SYSTEM"],
            ["14:28:59","Aircraft assigned","DOM-401 · Matrice 4T","USER"],
          ].map(([time,event,detail,type]) => <div key={time} style={{ display: "grid", gridTemplateColumns: "72px 1fr 64px", gap: 10, border: `1px solid ${LINE}`, borderRadius: 9, background: PANEL_2, padding: 10, alignItems: "center" }}><div style={{ fontFamily: "monospace", color: MUTED, fontSize: 9 }}>{time}</div><div><div style={{ fontSize: 10, fontWeight: 900 }}>{event}</div><div style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>{detail}</div></div><span style={{ color: ORANGE, fontSize: 8, fontWeight: 900 }}>{type}</span></div>)}
        </div>
      </Panel>
      <div style={{ display: "grid", gap: 12 }}>
        <Panel>
          <Header eyebrow="Compliance" title="Operational Gates" />
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {[
              ["Remote ID / aircraft identity","Ready"],
              ["Pilot / operator authorization","Ready"],
              ["Site geofence loaded","Ready"],
              ["Weather within profile","Review"],
              ["Emergency / lost-link plan","Ready"],
              ["Sensor calibration record","Ready"],
            ].map(([label,status]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 9, borderBottom: `1px solid ${LINE}`, paddingBottom: 7 }}><span style={{ color: MUTED }}>{label}</span><StatusPill tone={status === "Review" ? "amber" : "green"}>{status.toUpperCase()}</StatusPill></div>)}
          </div>
        </Panel>
        <Panel>
          <Header eyebrow="Records" title="Evidence Package" />
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {[["Flight log",FileClock],["Route manifest",Route],["Sensor readings",Gauge],["Thermal captures",ThermometerSun],["Alert history",AlertTriangle],["Operator actions",ClipboardCheck]].map(([label,Icon]) => <div key={String(label)} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 9, display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 9 }}><Icon size={14} color={ORANGE}/>{String(label)}</div>)}
          </div>
        </Panel>
      </div>
    </div>
  );

  const content = view === "Command" ? commandView : view === "Scheduler" ? schedulerView : view === "Route Planner" ? plannerView : view === "Fleet" ? fleetView : view === "Sensors" ? sensorsView : complianceView;

  return (
    <div style={{ minHeight: 680, color: TEXT, background: `radial-gradient(circle at 72% 0%, rgba(244,90,30,.12), transparent 24%), ${BG}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Orbit size={20} color={ORANGE} />
            <span style={{ color: ORANGE, fontWeight: 950, fontSize: 11, letterSpacing: ".16em" }}>DOMINIC HUB</span>
            <StatusPill tone="blue">REFINERY SIMULATION</StatusPill>
          </div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 5 }}>Autonomous Operations Command Center</div>
          <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>Mission planning, fleet control, sensor awareness, alerts and audit — designed now, hardware-connected progressively.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 9, background: PANEL, padding: "8px 10px", minWidth: 112 }}><div style={{ color: MUTED, fontSize: 8 }}>SYSTEM</div><div style={{ color: GREEN, fontSize: 11, fontWeight: 900, marginTop: 2 }}>SIMULATION SAFE</div></div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 9, background: PANEL, padding: "8px 10px", minWidth: 112 }}><div style={{ color: MUTED, fontSize: 8 }}>AIRCRAFT LINK</div><div style={{ color: AMBER, fontSize: 11, fontWeight: 900, marginTop: 2 }}>NOT CONNECTED</div></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "9px 10px", borderBottom: `1px solid ${LINE}`, background: "#0D141A" }}>
        {views.map(({ label, icon: Icon }) => (
          <button key={label} onClick={() => setView(label)} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7, border: `1px solid ${view === label ? "rgba(244,90,30,.65)" : LINE}`, borderRadius: 8, background: view === label ? "rgba(244,90,30,.12)" : PANEL, color: view === label ? TEXT : MUTED, padding: "8px 10px", fontSize: 10, fontWeight: 900, cursor: "pointer" }}><Icon size={14} color={view === label ? ORANGE : MUTED}/>{label}</button>
        ))}
      </div>

      <div style={{ padding: 12 }}>{content}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${LINE}`, padding: "9px 12px", color: MUTED, fontSize: 9 }}>
        <ShieldCheck size={13} color={GREEN} />
        This HUB build is an operations simulator. It does not transmit commands to a real aircraft, dock, or LDAR sensor.
      </div>
    </div>
  );
}
