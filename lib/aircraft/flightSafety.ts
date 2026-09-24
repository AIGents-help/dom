import type { UniversalAircraftState } from "@/lib/aircraft/contract";

export type FlightSafetySeverity = "info" | "warning" | "critical";
export type FlightSafetyAction = "continue" | "pause" | "return_home" | "abort";

export type FlightSafetyPolicy = {
  minimumLaunchBatteryPct: number;
  returnHomeBatteryPct: number;
  criticalBatteryPct: number;
  minimumSatellites: number;
  requireGnssGoodOrBetter: boolean;
  requireRtkFixed?: boolean;
  telemetryStaleAfterMs: number;
  obstacleAction: Exclude<FlightSafetyAction, "continue">;
};

export type FlightSafetyIssue = {
  code: string;
  severity: FlightSafetySeverity;
  action: FlightSafetyAction;
  message: string;
};

export type FlightSafetyAssessment = {
  safeToLaunch: boolean;
  highestAction: FlightSafetyAction;
  issues: FlightSafetyIssue[];
};

export const defaultFlightSafetyPolicy: FlightSafetyPolicy = {
  minimumLaunchBatteryPct: 30,
  returnHomeBatteryPct: 20,
  criticalBatteryPct: 12,
  minimumSatellites: 8,
  requireGnssGoodOrBetter: true,
  requireRtkFixed: false,
  telemetryStaleAfterMs: 3000,
  obstacleAction: "pause",
};

const actionRank: Record<FlightSafetyAction, number> = {
  continue: 0,
  pause: 1,
  return_home: 2,
  abort: 3,
};

function worseAction(a: FlightSafetyAction, b: FlightSafetyAction) {
  return actionRank[a] >= actionRank[b] ? a : b;
}

export function evaluateFlightSafety(input: {
  state: UniversalAircraftState;
  nowMs?: number;
  phase: "preflight" | "flight";
  policy?: Partial<FlightSafetyPolicy>;
}): FlightSafetyAssessment {
  const policy = { ...defaultFlightSafetyPolicy, ...input.policy };
  const state = input.state;
  const nowMs = input.nowMs ?? Date.now();
  const issues: FlightSafetyIssue[] = [];

  const push = (issue: FlightSafetyIssue) => issues.push(issue);

  if (!state.connected) {
    push({
      code: "aircraft_disconnected",
      severity: "critical",
      action: "abort",
      message: "Aircraft connection is lost.",
    });
  }

  const telemetryAgeMs = Math.max(0, nowMs - state.timestampMs);
  if (telemetryAgeMs > policy.telemetryStaleAfterMs) {
    push({
      code: "telemetry_stale",
      severity: "critical",
      action: input.phase === "preflight" ? "abort" : "return_home",
      message: `Aircraft telemetry is stale by ${telemetryAgeMs} ms.`,
    });
  }

  if (state.failsafe) {
    push({
      code: "aircraft_failsafe",
      severity: "critical",
      action: "abort",
      message: `Aircraft reports failsafe: ${state.failsafe}`,
    });
  }

  if (typeof state.batteryPercent === "number") {
    if (state.batteryPercent <= policy.criticalBatteryPct) {
      push({
        code: "battery_critical",
        severity: "critical",
        action: "abort",
        message: `Battery is critically low at ${state.batteryPercent.toFixed(0)}%.`,
      });
    } else if (
      input.phase === "flight" &&
      state.batteryPercent <= policy.returnHomeBatteryPct
    ) {
      push({
        code: "battery_return_home",
        severity: "critical",
        action: "return_home",
        message: `Battery is at ${state.batteryPercent.toFixed(0)}%; return-home threshold reached.`,
      });
    } else if (
      input.phase === "preflight" &&
      state.batteryPercent < policy.minimumLaunchBatteryPct
    ) {
      push({
        code: "battery_launch_block",
        severity: "critical",
        action: "abort",
        message: `Battery is ${state.batteryPercent.toFixed(0)}%; minimum launch battery is ${policy.minimumLaunchBatteryPct}%.`,
      });
    }
  }

  if (typeof state.satellites === "number" && state.satellites < policy.minimumSatellites) {
    push({
      code: "gnss_satellites_low",
      severity: input.phase === "preflight" ? "critical" : "warning",
      action: input.phase === "preflight" ? "abort" : "pause",
      message: `Only ${state.satellites} GNSS satellites are available; minimum is ${policy.minimumSatellites}.`,
    });
  }

  if (
    policy.requireGnssGoodOrBetter &&
    state.gnssQuality &&
    !["good", "excellent"].includes(state.gnssQuality)
  ) {
    push({
      code: "gnss_quality_degraded",
      severity: input.phase === "preflight" ? "critical" : "warning",
      action: input.phase === "preflight" ? "abort" : "pause",
      message: `GNSS quality is ${state.gnssQuality}.`,
    });
  }

  if (policy.requireRtkFixed && state.rtkState && state.rtkState !== "fixed") {
    push({
      code: "rtk_not_fixed",
      severity: input.phase === "preflight" ? "critical" : "warning",
      action: input.phase === "preflight" ? "abort" : "pause",
      message: `RTK is ${state.rtkState}; fixed solution is required by this mission policy.`,
    });
  }

  if (state.obstacleAlert) {
    push({
      code: "obstacle_alert",
      severity: "critical",
      action: policy.obstacleAction,
      message: "Aircraft obstacle alert is active.",
    });
  }

  let highestAction: FlightSafetyAction = "continue";
  for (const issue of issues) highestAction = worseAction(highestAction, issue.action);

  return {
    safeToLaunch:
      input.phase === "preflight" &&
      !issues.some((issue) => issue.severity === "critical"),
    highestAction,
    issues,
  };
}
