import { describe, expect, it } from "vitest";
import { evaluateFlightSafety } from "@/lib/aircraft/flightSafety";
import type { UniversalAircraftState } from "@/lib/aircraft/contract";

function state(patch: Partial<UniversalAircraftState> = {}): UniversalAircraftState {
  return {
    aircraftId: "test-1",
    vendor: "simulator",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 20,
    headingDeg: 0,
    batteryPercent: 80,
    satellites: 18,
    gnssQuality: "good",
    rtkState: "fixed",
    gimbalPitchDeg: -20,
    obstacleAlert: false,
    failsafe: null,
    timestampMs: 10_000,
    ...patch,
  };
}

describe("DOMINIC flight safety policy", () => {
  it("allows a healthy aircraft to launch", () => {
    const result = evaluateFlightSafety({
      state: state(),
      nowMs: 10_500,
      phase: "preflight",
    });
    expect(result.safeToLaunch).toBe(true);
    expect(result.highestAction).toBe("continue");
  });

  it("blocks launch on low battery", () => {
    const result = evaluateFlightSafety({
      state: state({ batteryPercent: 24 }),
      nowMs: 10_500,
      phase: "preflight",
    });
    expect(result.safeToLaunch).toBe(false);
    expect(result.issues.some((issue) => issue.code === "battery_launch_block")).toBe(true);
  });

  it("commands return-home when battery crosses the flight threshold", () => {
    const result = evaluateFlightSafety({
      state: state({ batteryPercent: 19 }),
      nowMs: 10_500,
      phase: "flight",
    });
    expect(result.highestAction).toBe("return_home");
  });

  it("treats obstacle alerts as an immediate safety hold", () => {
    const result = evaluateFlightSafety({
      state: state({ obstacleAlert: true }),
      nowMs: 10_500,
      phase: "flight",
    });
    expect(result.highestAction).toBe("pause");
    expect(result.issues.some((issue) => issue.code === "obstacle_alert")).toBe(true);
  });

  it("detects stale telemetry", () => {
    const result = evaluateFlightSafety({
      state: state({ timestampMs: 1_000 }),
      nowMs: 10_500,
      phase: "flight",
    });
    expect(result.highestAction).toBe("return_home");
    expect(result.issues.some((issue) => issue.code === "telemetry_stale")).toBe(true);
  });

  it("can require RTK fixed for precision missions", () => {
    const result = evaluateFlightSafety({
      state: state({ rtkState: "float" }),
      nowMs: 10_500,
      phase: "preflight",
      policy: { requireRtkFixed: true },
    });
    expect(result.safeToLaunch).toBe(false);
    expect(result.issues.some((issue) => issue.code === "rtk_not_fixed")).toBe(true);
  });
});
