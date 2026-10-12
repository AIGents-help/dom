import { describe, expect, it } from "vitest";
import { runBenchReadiness } from "@/lib/aircraft/benchReadiness";
import type {
  AircraftCapabilities, AircraftVendor, CommandResult, DominicAircraftAdapter,
  UniversalAircraftCommand, UniversalAircraftState, UniversalMediaCapture,
} from "@/lib/aircraft/contract";

// A deterministic adapter fixture, not evidence of physical aircraft operation.
function aircraft(initial: Partial<UniversalAircraftState> = {}, vendor: AircraftVendor = "dji") {
  const state: UniversalAircraftState = {
    aircraftId: "aircraft-1", vendor, model: "Matrice 4E", connected: true,
    latitude: 39.95, longitude: -75.16, relativeAltitudeFt: 0, headingDeg: 0,
    gimbalPitchDeg: 0, batteryPercent: 95, satellites: 20, gnssQuality: "excellent",
    rtkState: "fixed", homeLatitude: 39.95, homeLongitude: -75.16,
    timestampMs: Date.now(), ...initial,
  };
  const capabilities: AircraftCapabilities = {
    telemetry: true, arm: true, takeoff: true, goTo: true, velocityControl: true,
    yawControl: true, gimbalControl: true, photoCapture: true, videoCapture: true,
    pauseResume: true, returnHome: true, land: true, obstacleSensing: true, rtk: true,
  };
  const listeners = new Set<(capture: UniversalMediaCapture) => void>();
  const commands: UniversalAircraftCommand[] = [];
  const emit = (capture: UniversalMediaCapture) => { for (const listener of listeners) listener(capture); };
  const photo = (checkpointId?: string): UniversalMediaCapture => ({
    id: "photo-" + crypto.randomUUID(), aircraftId: state.aircraftId, checkpointId,
    capturedAtMs: Date.now(), mimeType: "image/jpeg", filename: "test.jpg",
    latitude: state.latitude, longitude: state.longitude, relativeAltitudeFt: 0,
    headingDeg: 0, gimbalPitchDeg: 0,
  });
  const adapter: DominicAircraftAdapter = {
    vendor, capabilities,
    connect: async () => { state.connected = true; state.timestampMs = Date.now(); },
    disconnect: async () => { state.connected = false; },
    getState: () => ({ ...state }), subscribe: () => () => {},
    subscribeMedia: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    send: async (command) => {
      commands.push(command);
      if (command.type === "capturePhoto") emit(photo(command.checkpointId));
      return { accepted: true, command: command.type };
    },
  };
  return { adapter, state, commands, listeners, emit, photo };
}
const fast = { commandTimeoutMs: 20, mediaTimeoutMs: 20 };

describe("DOMINIC bench readiness evidence", () => {
  it("passes complete current non-simulator fixture evidence without treating it as a physical test", async () => {
    const fixture = aircraft();
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropsOffBench).toBe(true);
    expect(report.readyForPropOnFieldTest).toBe(true);
    expect(report.checks.find((check) => check.id === "media_roundtrip")?.status).toBe("pass");
    expect(fixture.listeners.size).toBe(0);
  });
  it("allows software bench checks in simulation but never physical field readiness", async () => {
    const report = await runBenchReadiness(aircraft({}, "simulator").adapter, fast);
    expect(report.readyForPropsOffBench).toBe(true);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === "simulation")?.status).toBe("warn");
  });
  it("refuses vendor mismatch and does not send commands", async () => {
    const fixture = aircraft({ vendor: "simulator" });
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropsOffBench).toBe(false);
    expect(fixture.commands.length).toBe(0);
  });
  it.each([
    ["missing aircraft ID", { aircraftId: " " }],
    ["low battery", { batteryPercent: 25 }],
    ["invalid battery", { batteryPercent: Infinity }],
    ["out-of-range battery", { batteryPercent: 101 }],
    ["stale telemetry", { timestampMs: Date.now() - 60_000 }],
    ["future telemetry", { timestampMs: Date.now() + 60_000 }],
    ["nonfinite telemetry", { timestampMs: NaN }],
    ["invalid home point", { homeLatitude: NaN }],
    ["out-of-range home point", { homeLongitude: 181 }],
    ["invalid yaw target", { headingDeg: Infinity }],
    ["invalid gimbal target", { gimbalPitchDeg: NaN }],
    ["invalid satellite count", { satellites: Infinity }],
    ["invalid latitude", { latitude: NaN }],
    ["out-of-range longitude", { longitude: 181 }],
    ["invalid altitude", { relativeAltitudeFt: Infinity }],
  ] as Array<[string, Partial<UniversalAircraftState>]>) ("fails closed for %s", async (_, initial) => {
    const fixture = aircraft(initial);
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropsOffBench).toBe(false);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(fixture.commands.length).toBe(0);
  });
  it.each([
    ["infinite telemetry limit", { telemetryMaxAgeMs: Infinity }],
    ["invalid telemetry limit", { telemetryMaxAgeMs: NaN }],
    ["negative telemetry limit", { telemetryMaxAgeMs: -1 }],
    ["infinite command limit", { commandTimeoutMs: Infinity }],
    ["zero command limit", { commandTimeoutMs: 0 }],
    ["invalid media limit", { mediaTimeoutMs: NaN }],
  ] as const)("rejects %s before sending commands", async (_, options) => {
    const fixture = aircraft();
    const report = await runBenchReadiness(fixture.adapter, { ...fast, ...options });
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks[0].id).toBe("options");
    expect(fixture.commands.length).toBe(0);
  });
  it("rejects required RTK without a fixed solution", async () => {
    const report = await runBenchReadiness(aircraft({ rtkState: "float" }).adapter, { ...fast, requireRtkFixed: true });
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === "rtk")?.status).toBe("fail");
  });
  it("rejects a missing autonomous capability", async () => {
    const fixture = aircraft();
    fixture.adapter.capabilities.returnHome = false;
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropsOffBench).toBe(false);
    expect(report.checks.find((check) => check.id === "capabilities")?.message).toContain("returnHome");
  });
  it.each([
    ["command checks", { testCommandRoundTrips: false }, "yaw_roundtrip"],
    ["media checks", { testMediaCapture: false }, "media_roundtrip"],
  ] as const)("does not approve field readiness with skipped %s", async (_, option, id) => {
    const report = await runBenchReadiness(aircraft().adapter, { ...fast, ...option });
    expect(report.readyForPropsOffBench).toBe(true);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === id)?.status).toBe("skipped");
  });
  it("does not approve an adapter without media subscription support", async () => {
    const fixture = aircraft();
    fixture.adapter.subscribeMedia = undefined;
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
  });
  it("rejects acknowledgements for another command", async () => {
    const fixture = aircraft();
    fixture.adapter.send = async () => ({ accepted: true, command: "land" });
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === "yaw_roundtrip")?.status).toBe("fail");
    expect(fixture.listeners.size).toBe(0);
  });
  it.each([
    ["wrong aircraft", { aircraftId: "another-aircraft" }],
    ["old checkpoint", { checkpointId: "bench-readiness" }],
    ["stale photo", { capturedAtMs: 1 }],
    ["future photo", { capturedAtMs: Date.now() + 60_000 }],
    ["invalid timestamp", { capturedAtMs: NaN }],
    ["non-photo event", { mimeType: "video/mp4" }],
    ["missing event ID", { id: " " }],
  ] as Array<[string, Partial<UniversalMediaCapture>]>) ("ignores %s and times out without a matching photo", async (_, patch) => {
    const fixture = aircraft();
    fixture.adapter.send = async (command) => {
      if (command.type === "capturePhoto") fixture.emit({ ...fixture.photo(command.checkpointId), ...patch });
      return { accepted: true, command: command.type };
    };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === "media_roundtrip")?.status).toBe("fail");
    expect(fixture.listeners.size).toBe(0);
  });
  it("waits past unrelated events for the matching synchronous photo", async () => {
    const fixture = aircraft();
    fixture.adapter.send = async (command) => {
      if (command.type === "capturePhoto") {
        fixture.emit({ ...fixture.photo(command.checkpointId), aircraftId: "foreign-aircraft" });
        fixture.emit(fixture.photo(command.checkpointId));
      }
      return { accepted: true, command: command.type };
    };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(true);
    expect(fixture.listeners.size).toBe(0);
  });
  it("does not accept a photo when its command was rejected", async () => {
    const fixture = aircraft();
    const send = fixture.adapter.send;
    fixture.adapter.send = async (command) => {
      const result = await send(command);
      return command.type === "capturePhoto" ? { ...result, accepted: false } : result;
    };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(fixture.listeners.size).toBe(0);
  });
  it("cleans up the media subscription after a command timeout", async () => {
    const fixture = aircraft();
    const send = fixture.adapter.send;
    fixture.adapter.send = (command) => command.type === "capturePhoto" ? new Promise<CommandResult>(() => {}) : send(command);
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(fixture.listeners.size).toBe(0);
  });
  it("turns subscription exceptions into a failed check", async () => {
    const fixture = aircraft();
    fixture.adapter.subscribeMedia = () => { throw new Error("Subscription failed"); };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === "media_roundtrip")?.message).toContain("Subscription failed");
  });
  it.each([
    ["disconnect", { connected: false }, "final_connection"],
    ["stale telemetry", { timestampMs: 1 }, "final_telemetry_freshness"],
    ["low battery", { batteryPercent: 5 }, "final_battery"],
    ["changed aircraft", { aircraftId: "another-aircraft" }, "aircraft_unchanged"],
  ] as Array<[string, Partial<UniversalAircraftState>, string]>) ("rejects a %s occurring during the round-trips", async (_, patch, id) => {
    const fixture = aircraft();
    const send = fixture.adapter.send;
    fixture.adapter.send = async (command) => {
      const result = await send(command);
      if (command.type === "capturePhoto") Object.assign(fixture.state, patch);
      return result;
    };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.find((check) => check.id === id)?.status).toBe("fail");
  });
  it("uses distinct checkpoints for concurrent runs and releases every listener", async () => {
    const fixture = aircraft();
    const reports = await Promise.all([runBenchReadiness(fixture.adapter, fast), runBenchReadiness(fixture.adapter, fast)]);
    const ids = fixture.commands.filter((command) => command.type === "capturePhoto").map((command) => command.checkpointId);
    expect(new Set(ids).size).toBe(2);
    expect(reports.every((report) => report.readyForPropOnFieldTest)).toBe(true);
    expect(fixture.listeners.size).toBe(0);
  });
  it("checks current telemetry after connecting", async () => {
    const report = await runBenchReadiness(aircraft({ connected: false, timestampMs: 1 }).adapter, fast);
    expect(report.readyForPropOnFieldTest).toBe(true);
  });
  it("reports a failed connection without attempting round-trips", async () => {
    const fixture = aircraft({ connected: false });
    fixture.adapter.connect = async () => { throw new Error("Controller unavailable"); };
    const report = await runBenchReadiness(fixture.adapter, fast);
    expect(report.readyForPropsOffBench).toBe(false);
    expect(report.checks[0].message).toBe("Controller unavailable");
    expect(fixture.commands.length).toBe(0);
  });
});
