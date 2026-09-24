import type {
  AircraftCapabilities,
  CommandResult,
  DominicAircraftAdapter,
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
  "telemetry",
  "arm",
  "takeoff",
  "goTo",
  "yawControl",
  "gimbalControl",
  "photoCapture",
  "returnHome",
  "land",
];

function makeCheck(
  id: string,
  label: string,
  status: BenchCheckStatus,
  message: string,
): BenchCheck {
  return { id, label, status, message };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function commandCheck(
  result: CommandResult,
  id: string,
  label: string,
): BenchCheck {
  return result.accepted
    ? makeCheck(id, label, "pass", result.message ?? "Command accepted.")
    : makeCheck(
        id,
        label,
        "fail",
        result.message ?? "Aircraft rejected the command.",
      );
}

function stateCheck(
  state: UniversalAircraftState,
  options: BenchReadinessOptions,
  nowMs: number,
): BenchCheck[] {
  const checks: BenchCheck[] = [];
  const ageMs = Math.max(0, nowMs - state.timestampMs);
  const maxAge = options.telemetryMaxAgeMs ?? 3000;

  checks.push(
    makeCheck(
      "connection",
      "Aircraft connection",
      state.connected ? "pass" : "fail",
      state.connected ? "Aircraft bridge is connected." : "Aircraft bridge is disconnected.",
    ),
  );

  checks.push(
    makeCheck(
      "telemetry_freshness",
      "Telemetry freshness",
      ageMs <= maxAge ? "pass" : "fail",
      ageMs <= maxAge
        ? "Telemetry age is " + ageMs + " ms."
        : "Telemetry is stale by " + ageMs + " ms; limit is " + maxAge + " ms.",
    ),
  );

  const battery = state.batteryPercent;
  const minimumBattery = options.minimumBatteryPercent ?? 40;
  checks.push(
    makeCheck(
      "battery",
      "Battery",
      typeof battery !== "number"
        ? "warn"
        : battery >= minimumBattery
          ? "pass"
          : "fail",
      typeof battery !== "number"
        ? "Battery percentage is not available from this adapter."
        : "Battery is " + battery.toFixed(0) + "%; bench/field threshold is " + minimumBattery + "%.",
    ),
  );

  const satellites = state.satellites;
  const gnssGood =
    state.gnssQuality === "good" || state.gnssQuality === "excellent";
  checks.push(
    makeCheck(
      "gnss",
      "GNSS",
      gnssGood && (typeof satellites !== "number" || satellites >= 8)
        ? "pass"
        : state.gnssQuality === undefined && satellites === undefined
          ? "warn"
          : "fail",
      "GNSS quality: " +
        (state.gnssQuality ?? "unknown") +
        (typeof satellites === "number" ? "; satellites: " + satellites : "") +
        ".",
    ),
  );

  if (options.requireRtkFixed) {
    checks.push(
      makeCheck(
        "rtk",
        "RTK",
        state.rtkState === "fixed" ? "pass" : "fail",
        "RTK state is " + (state.rtkState ?? "unknown") + "; FIX is required.",
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "rtk",
        "RTK",
        state.rtkState === "fixed"
          ? "pass"
          : state.rtkState === "unsupported"
            ? "skipped"
            : "warn",
        "RTK state is " + (state.rtkState ?? "unknown") + ".",
      ),
    );
  }

  checks.push(
    makeCheck(
      "failsafe",
      "Aircraft failsafe",
      state.failsafe ? "fail" : "pass",
      state.failsafe
        ? "Aircraft reports failsafe: " + state.failsafe
        : "No aircraft failsafe is active.",
    ),
  );

  checks.push(
    makeCheck(
      "obstacle",
      "Obstacle sensing",
      state.obstacleAlert ? "fail" : "pass",
      state.obstacleAlert
        ? "Obstacle alert is active."
        : "No active obstacle alert is reported.",
    ),
  );

  if (
    typeof state.homeLatitude === "number" &&
    typeof state.homeLongitude === "number"
  ) {
    checks.push(
      makeCheck(
        "home",
        "Home / RTH point",
        "pass",
        "Home point reported at " +
          state.homeLatitude.toFixed(6) +
          ", " +
          state.homeLongitude.toFixed(6) +
          ".",
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "home",
        "Home / RTH point",
        "warn",
        "Aircraft adapter is not reporting a home/RTH position.",
      ),
    );
  }

  return checks;
}

export async function runBenchReadiness(
  adapter: DominicAircraftAdapter,
  options: BenchReadinessOptions = {},
): Promise<BenchReadinessReport> {
  const checks: BenchCheck[] = [];
  const nowMs = Date.now();
  const commandTimeoutMs = options.commandTimeoutMs ?? 3000;
  const mediaTimeoutMs = options.mediaTimeoutMs ?? 5000;

  if (!adapter.getState().connected) {
    try {
      await withTimeout(
        adapter.connect(),
        commandTimeoutMs,
        "Aircraft bridge connection timed out.",
      );
    } catch (error) {
      const state = adapter.getState();
      return {
        generatedAtMs: Date.now(),
        aircraftId: state.aircraftId,
        vendor: state.vendor,
        model: state.model,
        readyForPropsOffBench: false,
        readyForPropOnFieldTest: false,
        checks: [
          makeCheck(
            "connection",
            "Aircraft connection",
            "fail",
            error instanceof Error ? error.message : "Unable to connect to aircraft.",
          ),
        ],
      };
    }
  }

  const state = adapter.getState();
  checks.push(...stateCheck(state, options, nowMs));

  const missing = requiredAutonomousCapabilities.filter(
    (capability) => !adapter.capabilities[capability],
  );
  checks.push(
    makeCheck(
      "capabilities",
      "Autonomous capabilities",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0
        ? "Required autonomous capability set is available."
        : "Missing: " + missing.join(", ") + ".",
    ),
  );

  const preflight = evaluateFlightSafety({
    state,
    phase: "preflight",
    policy: {
      ...options.safetyPolicy,
      requireRtkFixed:
        options.requireRtkFixed ??
        options.safetyPolicy?.requireRtkFixed ??
        false,
      minimumLaunchBatteryPct:
        options.minimumBatteryPercent ??
        options.safetyPolicy?.minimumLaunchBatteryPct ??
        40,
    },
  });
  checks.push(
    makeCheck(
      "runtime_safety_policy",
      "Runtime safety policy",
      preflight.safeToLaunch ? "pass" : "fail",
      preflight.issues.length
        ? preflight.issues.map((issue) => issue.message).join(" ")
        : "Runtime safety policy is clear.",
    ),
  );

  if (options.testCommandRoundTrips !== false) {
    if (adapter.capabilities.yawControl) {
      try {
        const result = await withTimeout(
          adapter.send({ type: "setYaw", headingDeg: state.headingDeg }),
          commandTimeoutMs,
          "Yaw command timed out.",
        );
        checks.push(commandCheck(result, "yaw_roundtrip", "Yaw command round-trip"));
      } catch (error) {
        checks.push(
          makeCheck(
            "yaw_roundtrip",
            "Yaw command round-trip",
            "fail",
            error instanceof Error ? error.message : "Yaw command failed.",
          ),
        );
      }
    }

    if (adapter.capabilities.gimbalControl) {
      try {
        const result = await withTimeout(
          adapter.send({ type: "setGimbal", pitchDeg: state.gimbalPitchDeg }),
          commandTimeoutMs,
          "Gimbal command timed out.",
        );
        checks.push(
          commandCheck(result, "gimbal_roundtrip", "Gimbal command round-trip"),
        );
      } catch (error) {
        checks.push(
          makeCheck(
            "gimbal_roundtrip",
            "Gimbal command round-trip",
            "fail",
            error instanceof Error ? error.message : "Gimbal command failed.",
          ),
        );
      }
    }
  }

  if (options.testMediaCapture !== false) {
    if (!adapter.capabilities.photoCapture || !adapter.subscribeMedia) {
      checks.push(
        makeCheck(
          "media_roundtrip",
          "Photo/media round-trip",
          "warn",
          "Adapter cannot provide a complete media event round-trip.",
        ),
      );
    } else {
      let unsubscribeMedia: (() => void) | undefined;
      const mediaPromise = new Promise<UniversalMediaCapture>((resolve) => {
        unsubscribeMedia = adapter.subscribeMedia?.((capture) => {
          unsubscribeMedia?.();
          resolve(capture);
        });
      });

      try {
        const captureResult = await withTimeout(
          adapter.send({ type: "capturePhoto", checkpointId: "bench-readiness" }),
          commandTimeoutMs,
          "Capture command timed out.",
        );
        if (!captureResult.accepted) {
          unsubscribeMedia?.();
          checks.push(
            commandCheck(
              captureResult,
              "media_roundtrip",
              "Photo/media round-trip",
            ),
          );
        } else {
          const media = await withTimeout(
            mediaPromise,
            mediaTimeoutMs,
            "Capture command was accepted but no media event returned.",
          );
          checks.push(
            makeCheck(
              "media_roundtrip",
              "Photo/media round-trip",
              "pass",
              "Received " +
                (media.filename ?? media.id) +
                " from aircraft media stream.",
            ),
          );
        }
      } catch (error) {
        unsubscribeMedia?.();
        checks.push(
          makeCheck(
            "media_roundtrip",
            "Photo/media round-trip",
            "fail",
            error instanceof Error ? error.message : "Media round-trip failed.",
          ),
        );
      }
    }
  }

  const anyFail = checks.some((check) => check.status === "fail");
  const fieldBlockingWarnings = checks.some(
    (check) =>
      check.status === "warn" &&
      ["battery", "gnss", "rtk", "home", "media_roundtrip"].includes(check.id),
  );

  return {
    generatedAtMs: Date.now(),
    aircraftId: state.aircraftId,
    vendor: state.vendor,
    model: state.model,
    readyForPropsOffBench: !anyFail,
    readyForPropOnFieldTest: !anyFail && !fieldBlockingWarnings,
    checks,
  };
}
