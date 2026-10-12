import type {
  AircraftCapabilities,
  CommandResult,
  DominicAircraftAdapter,
  UniversalAircraftCommand,
  UniversalAircraftState,
  UniversalMediaCapture,
} from "@/lib/aircraft/contract";
import { evaluateFlightSafety, type FlightSafetyPolicy } from "@/lib/aircraft/flightSafety";

export type BenchCheckStatus = "pass" | "warn" | "fail" | "skipped";
export type BenchCheck = {
  id: string;
  label: string;
  status: BenchCheckStatus;
  message: string;
};
export type BenchReadinessReport = {
  generatedAtMs: number;
  aircraftId: string;
  vendor: string;
  model?: string;
  readyForPropsOffBench: boolean;
  readyForPropOnFieldTest: boolean;
  checks: BenchCheck[];
};
export type BenchReadinessOptions = {
  telemetryMaxAgeMs?: number;
  requireRtkFixed?: boolean;
  minimumBatteryPercent?: number;
  commandTimeoutMs?: number;
  mediaTimeoutMs?: number;
  testCommandRoundTrips?: boolean;
  testMediaCapture?: boolean;
  safetyPolicy?: Partial<FlightSafetyPolicy>;
};

const requiredAutonomousCapabilities: Array<keyof AircraftCapabilities> = [
  "telemetry", "arm", "takeoff", "goTo", "yawControl", "gimbalControl",
  "photoCapture", "returnHome", "land",
];
const requiredRoundTrips = ["yaw_roundtrip", "gimbal_roundtrip", "media_roundtrip"];

function makeCheck(id: string, label: string, status: BenchCheckStatus, message: string): BenchCheck {
  return { id, label, status, message };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function commandCheck(result: CommandResult, id: string, label: string,
  expectedCommand: UniversalAircraftCommand["type"]): BenchCheck {
  if (result.command !== expectedCommand) {
    return makeCheck(id, label, "fail", "Received an acknowledgement for a different command.");
  }
  return result.accepted
    ? makeCheck(id, label, "pass", result.message ?? "Command accepted.")
    : makeCheck(id, label, "fail", result.message ?? "Aircraft rejected the command.");
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function stateCheck(state: UniversalAircraftState, options: BenchReadinessOptions, nowMs: number): BenchCheck[] {
  const checks: BenchCheck[] = [];
  const ageMs = nowMs - state.timestampMs;
  const maxAge = options.telemetryMaxAgeMs ?? 3000;
  const fresh = Number.isFinite(state.timestampMs) && state.timestampMs > 0 && ageMs >= 0 && ageMs <= maxAge;
  checks.push(makeCheck("connection", "Aircraft connection", state.connected ? "pass" : "fail",
    state.connected ? "Aircraft bridge is connected." : "Aircraft bridge is disconnected."));
  checks.push(makeCheck("telemetry_freshness", "Telemetry freshness", fresh ? "pass" : "fail",
    fresh ? "Telemetry age is " + ageMs + " ms."
      : "Telemetry timestamp is missing, invalid, future-dated or stale; limit is " + maxAge + " ms."));

  const battery = state.batteryPercent;
  const minimumBattery = options.minimumBatteryPercent ?? 40;
  checks.push(makeCheck("battery", "Battery",
    battery === undefined ? "warn" : finiteInRange(battery, 0, 100) && battery >= minimumBattery ? "pass" : "fail",
    battery === undefined ? "Battery percentage is not available from this adapter."
      : finiteInRange(battery, 0, 100) ? "Battery is " + battery.toFixed(0) + "%; bench/field threshold is " + minimumBattery + "%."
        : "Battery percentage is invalid."));

  const satellites = state.satellites;
  const gnssGood = state.gnssQuality === "good" || state.gnssQuality === "excellent";
  checks.push(makeCheck("gnss", "GNSS",
    gnssGood && (satellites === undefined || (Number.isInteger(satellites) && satellites >= 8)) ? "pass"
      : state.gnssQuality === undefined && satellites === undefined ? "warn" : "fail",
    "GNSS quality: " + (state.gnssQuality ?? "unknown") +
    (satellites !== undefined ? "; satellites: " + satellites : "") + "."));

  checks.push(makeCheck("rtk", "RTK",
    state.rtkState === "fixed" ? "pass" : options.requireRtkFixed ? "fail"
      : state.rtkState === "unsupported" ? "skipped" : "warn",
    "RTK state is " + (state.rtkState ?? "unknown") + (options.requireRtkFixed ? "; FIX is required." : ".")));
  checks.push(makeCheck("failsafe", "Aircraft failsafe", state.failsafe ? "fail" : "pass",
    state.failsafe ? "Aircraft reports failsafe: " + state.failsafe : "No aircraft failsafe is active."));
  checks.push(makeCheck("obstacle", "Obstacle sensing", state.obstacleAlert ? "fail" : "pass",
    state.obstacleAlert ? "Obstacle alert is active." : "No active obstacle alert is reported."));
  const hasHome = state.homeLatitude !== undefined || state.homeLongitude !== undefined;
  const validHome = finiteInRange(state.homeLatitude, -90, 90) && finiteInRange(state.homeLongitude, -180, 180);
  checks.push(makeCheck("home", "Home / RTH point", validHome ? "pass" : hasHome ? "fail" : "warn",
    validHome ? "Home point reported at " + state.homeLatitude!.toFixed(6) + ", " + state.homeLongitude!.toFixed(6) + "."
      : hasHome ? "Aircraft reports an invalid home/RTH position." : "Aircraft adapter is not reporting a home/RTH position."));
  checks.push(makeCheck("position", "Aircraft position telemetry",
    finiteInRange(state.latitude, -90, 90) && finiteInRange(state.longitude, -180, 180) &&
      Number.isFinite(state.relativeAltitudeFt) ? "pass" : "fail",
    "Aircraft latitude, longitude and relative altitude must be finite and geographically valid."));
  checks.push(makeCheck("command_targets", "Command target telemetry",
    finiteInRange(state.headingDeg, 0, 360) && finiteInRange(state.gimbalPitchDeg, -180, 180) ? "pass" : "fail",
    "Yaw and gimbal targets must be finite and within their telemetry ranges."));
  return checks;
}

function runtimeSafetyCheck(state: UniversalAircraftState, options: BenchReadinessOptions, nowMs: number): BenchCheck {
  const preflight = evaluateFlightSafety({
    state, nowMs, phase: "preflight",
    policy: {
      ...options.safetyPolicy,
      telemetryStaleAfterMs: options.telemetryMaxAgeMs ?? options.safetyPolicy?.telemetryStaleAfterMs ?? 3000,
      requireRtkFixed: options.requireRtkFixed ?? options.safetyPolicy?.requireRtkFixed ?? false,
      minimumLaunchBatteryPct: options.minimumBatteryPercent ?? options.safetyPolicy?.minimumLaunchBatteryPct ?? 40,
    },
  });
  return makeCheck("runtime_safety_policy", "Runtime safety policy", preflight.safeToLaunch ? "pass" : "fail",
    preflight.issues.length ? preflight.issues.map((issue) => issue.message).join(" ") : "Runtime safety policy is clear.");
}

export async function runBenchReadiness(adapter: DominicAircraftAdapter,
  options: BenchReadinessOptions = {}): Promise<BenchReadinessReport> {
  const checks: BenchCheck[] = [];
  const commandTimeoutMs = options.commandTimeoutMs ?? 3000;
  const mediaTimeoutMs = options.mediaTimeoutMs ?? 5000;
  const invalidLimits = [
    ["telemetryMaxAgeMs", options.telemetryMaxAgeMs ?? 3000],
    ["commandTimeoutMs", commandTimeoutMs], ["mediaTimeoutMs", mediaTimeoutMs],
  ].filter(([, value]) => typeof value !== "number" || !Number.isFinite(value) || value <= 0);
  if (invalidLimits.length) {
    const state = adapter.getState();
    return {
      generatedAtMs: Date.now(), aircraftId: state.aircraftId, vendor: state.vendor, model: state.model,
      readyForPropsOffBench: false, readyForPropOnFieldTest: false,
      checks: [makeCheck("options", "Bench check limits", "fail",
        "Limits must be finite positive milliseconds: " + invalidLimits.map(([name]) => name).join(", ") + ".")],
    };
  }
  if (!adapter.getState().connected) {
    try {
      await withTimeout(adapter.connect(), commandTimeoutMs, "Aircraft bridge connection timed out.");
    } catch (error) {
      const state = adapter.getState();
      return {
        generatedAtMs: Date.now(), aircraftId: state.aircraftId, vendor: state.vendor, model: state.model,
        readyForPropsOffBench: false, readyForPropOnFieldTest: false,
        checks: [makeCheck("connection", "Aircraft connection", "fail",
          error instanceof Error ? error.message : "Unable to connect to aircraft.")],
      };
    }
  }
  // Read time AFTER connecting: connection setup may take longer than the freshness window.
  const state = adapter.getState();
  const nowMs = Date.now();
  const simulated = adapter.vendor === "simulator" || state.vendor === "simulator";
  checks.push(makeCheck("aircraft_identity", "Aircraft identity",
    state.aircraftId.trim() && adapter.vendor === state.vendor ? "pass" : "fail",
    "The adapter and telemetry must identify the same aircraft vendor and a non-empty aircraft ID."));
  checks.push(makeCheck("simulation", "Evidence source", simulated ? "warn" : "pass",
    simulated ? "Simulation can exercise bench software but cannot establish physical-aircraft field readiness."
      : "Non-simulator adapter reported. This is not proof of physical flight validation."));
  checks.push(...stateCheck(state, options, nowMs));
  const missing = requiredAutonomousCapabilities.filter((capability) => !adapter.capabilities[capability]);
  checks.push(makeCheck("capabilities", "Autonomous capabilities", missing.length === 0 ? "pass" : "fail",
    missing.length === 0 ? "Required autonomous capability set is available." : "Missing: " + missing.join(", ") + "."));
  checks.push(runtimeSafetyCheck(state, options, nowMs));
  const canTest = !checks.some((check) => check.status === "fail");

  for (const [capability, id, label, command] of [
    ["yawControl", "yaw_roundtrip", "Yaw command round-trip", { type: "setYaw", headingDeg: state.headingDeg }],
    ["gimbalControl", "gimbal_roundtrip", "Gimbal command round-trip", { type: "setGimbal", pitchDeg: state.gimbalPitchDeg }],
  ] as const) {
    if (!canTest || options.testCommandRoundTrips === false || !adapter.capabilities[capability]) {
      checks.push(makeCheck(id, label, "skipped", "Round-trip not performed; it cannot establish field readiness."));
      continue;
    }
    try {
      const result = await withTimeout(adapter.send(command), commandTimeoutMs, label + " timed out.");
      checks.push(commandCheck(result, id, label, command.type));
    } catch (error) {
      checks.push(makeCheck(id, label, "fail", error instanceof Error ? error.message : label + " failed."));
    }
  }

  if (!canTest || options.testMediaCapture === false) {
    checks.push(makeCheck("media_roundtrip", "Photo/media round-trip", "skipped", "Photo test not performed; it cannot establish field readiness."));
  } else if (!adapter.capabilities.photoCapture || !adapter.subscribeMedia) {
    checks.push(makeCheck("media_roundtrip", "Photo/media round-trip", "warn", "Adapter cannot provide a complete media event round-trip."));
  } else {
    let unsubscribeMedia: (() => void) | undefined;
    try {
      // Each run has a new token. Late events from earlier or concurrent runs cannot satisfy it.
      const checkpointId = "bench-readiness-" + crypto.randomUUID();
      const captureTiming: { startedAtMs?: number } = {};
      let resolveMedia!: (media: UniversalMediaCapture) => void;
      const mediaPromise = new Promise<UniversalMediaCapture>((resolve) => { resolveMedia = resolve; });
      unsubscribeMedia = adapter.subscribeMedia((capture) => {
        if (captureTiming.startedAtMs === undefined || capture.aircraftId !== state.aircraftId ||
          capture.checkpointId !== checkpointId || !capture.id?.trim() ||
          !capture.mimeType?.startsWith("image/") || !Number.isFinite(capture.capturedAtMs) ||
          capture.capturedAtMs < captureTiming.startedAtMs || capture.capturedAtMs > Date.now()) return;
        resolveMedia(capture);
      });
      captureTiming.startedAtMs = Date.now();
      const result = await withTimeout(adapter.send({ type: "capturePhoto", checkpointId }), commandTimeoutMs, "Capture command timed out.");
      const acknowledgement = commandCheck(result, "media_roundtrip", "Photo/media round-trip", "capturePhoto");
      if (acknowledgement.status !== "pass") {
        checks.push(acknowledgement);
      } else {
        const media = await withTimeout(mediaPromise, mediaTimeoutMs, "Capture accepted but no matching, current aircraft photo event returned.");
        checks.push(makeCheck("media_roundtrip", "Photo/media round-trip", "pass",
          "Received matching photo event " + (media.filename ?? media.id) + ". Image contents and detector accuracy still require separate validation."));
      }
    } catch (error) {
      checks.push(makeCheck("media_roundtrip", "Photo/media round-trip", "fail", error instanceof Error ? error.message : "Media round-trip failed."));
    } finally {
      // Handles synchronous events and subscription errors without leaving a live listener.
      unsubscribeMedia?.();
    }
  }

  const finalState = adapter.getState();
  const completedAtMs = Date.now();
  checks.push(makeCheck("aircraft_unchanged", "Aircraft remained unchanged",
    state.aircraftId === finalState.aircraftId && state.vendor === finalState.vendor && state.model === finalState.model ? "pass" : "fail",
    "Aircraft identity must remain unchanged throughout the bench check."));
  checks.push(...[...stateCheck(finalState, options, completedAtMs), runtimeSafetyCheck(finalState, options, completedAtMs)]
    .map((check) => ({ ...check, id: "final_" + check.id, label: "Final " + check.label })));
  const anyFail = checks.some((check) => check.status === "fail");
  const fieldBlockingWarnings = checks.some((check) => check.status === "warn" &&
    ["simulation", "battery", "gnss", "rtk", "home", "media_roundtrip", "final_battery", "final_gnss", "final_rtk", "final_home"].includes(check.id));
  const allRoundTripsPassed = requiredRoundTrips.every((id) => checks.some((check) => check.id === id && check.status === "pass"));
  return {
    generatedAtMs: completedAtMs, aircraftId: state.aircraftId, vendor: state.vendor, model: state.model,
    readyForPropsOffBench: !anyFail,
    readyForPropOnFieldTest: !simulated && !anyFail && !fieldBlockingWarnings && allRoundTripsPassed,
    checks,
  };
}
