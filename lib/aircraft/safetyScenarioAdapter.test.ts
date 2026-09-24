import { describe, expect, it } from "vitest";
import { buildGeographicCheckpoints, calculateObjectScanPlan } from "@/lib/capturePlanner";
import { DominicMissionEngine } from "@/lib/aircraft/missionEngine";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";
import { SafetyScenarioAircraftAdapter } from "@/lib/aircraft/safetyScenarioAdapter";

function checkpoints() {
  const plan = calculateObjectScanPlan({
    objectDiameterFt: 10,
    objectHeightFt: 8,
    standoffFt: 18,
    overlapPct: 75,
    horizontalFovDeg: 84,
  });
  return buildGeographicCheckpoints({
    plan,
    centerLatitude: 39.95,
    centerLongitude: -75.16,
    objectHeightFt: 8,
    baseRelativeAltitudeFt: 10,
  }).slice(0, 2);
}

function engineFor(
  scenario: ConstructorParameters<typeof SafetyScenarioAircraftAdapter>[1],
  options: Partial<ConstructorParameters<typeof DominicMissionEngine>[1]> = {},
) {
  const base = new SimulatorAircraftAdapter({
    latitude: 39.9499,
    longitude: -75.1601,
    batteryPercent: 90,
    satellites: 18,
    gnssQuality: "good",
    rtkState: "fixed",
  });
  const aircraft = new SafetyScenarioAircraftAdapter(base, scenario);
  return new DominicMissionEngine(aircraft, {
    centerLatitude: 39.95,
    centerLongitude: -75.16,
    checkpoints: checkpoints(),
    arrivalTimeoutMs: 300,
    safetyPollIntervalMs: 10,
    ...options,
  });
}

describe("DOMINIC Safety Scenario Lab", () => {
  it("completes the nominal control scenario", async () => {
    const result = await engineFor("none").execute();
    expect(result.phase).toBe("COMPLETE");
  });

  it("returns home when battery crosses the runtime RTH threshold", async () => {
    const result = await engineFor("battery_rth_on_first_transit").execute();
    expect(result.phase).toBe("ABORTED");
    expect(
      result.events.some((event) => event.message.includes("Safety return-home")),
    ).toBe(true);
    expect(
      result.safetyIssues.some((issue) => issue.code === "battery_return_home"),
    ).toBe(true);
  });

  it("can escalate an obstacle alert to return-home for unattended testing", async () => {
    const result = await engineFor("obstacle_on_first_transit", {
      safetyPolicy: { obstacleAction: "return_home" },
    }).execute();

    expect(result.phase).toBe("ABORTED");
    expect(
      result.safetyIssues.some((issue) => issue.code === "obstacle_alert"),
    ).toBe(true);
  });

  it("detects a silent telemetry feed through the independent watchdog", async () => {
    const result = await engineFor("telemetry_loss_on_first_transit", {
      safetyPolicy: { telemetryStaleAfterMs: 30 },
      arrivalTimeoutMs: 500,
    }).execute();

    expect(result.phase).toBe("ABORTED");
    expect(
      result.safetyIssues.some((issue) => issue.code === "telemetry_stale"),
    ).toBe(true);
  });

  it("aborts after a link disconnect", async () => {
    const result = await engineFor("disconnect_on_first_transit").execute();
    expect(result.phase).toBe("ABORTED");
    expect(
      result.safetyIssues.some((issue) => issue.code === "aircraft_disconnected"),
    ).toBe(true);
  });

  it("invokes emergency recovery when the camera rejects a capture", async () => {
    const result = await engineFor("reject_first_capture").execute();
    expect(result.phase).toBe("ABORTED");
    expect(result.error).toContain("camera command rejection");
    expect(
      result.events.some((event) => event.message.includes("Emergency recovery")),
    ).toBe(true);
  });
});
