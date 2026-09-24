import { describe, expect, it } from "vitest";
import { runBenchReadiness } from "@/lib/aircraft/benchReadiness";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";

describe("DOMINIC bench readiness", () => {
  it("passes a healthy simulator through bench and field readiness", async () => {
    const aircraft = new SimulatorAircraftAdapter({
      batteryPercent: 95,
      satellites: 20,
      gnssQuality: "excellent",
      rtkState: "fixed",
      homeLatitude: 39.95,
      homeLongitude: -75.16,
    });

    const report = await runBenchReadiness(aircraft, {
      requireRtkFixed: true,
      minimumBatteryPercent: 40,
    });

    expect(report.readyForPropsOffBench).toBe(true);
    expect(report.readyForPropOnFieldTest).toBe(true);
    expect(report.checks.some((check) => check.id === "media_roundtrip" && check.status === "pass")).toBe(true);
  });

  it("blocks field readiness when battery is below threshold", async () => {
    const aircraft = new SimulatorAircraftAdapter({
      batteryPercent: 25,
      satellites: 18,
      gnssQuality: "good",
      rtkState: "fixed",
      homeLatitude: 39.95,
      homeLongitude: -75.16,
    });

    const report = await runBenchReadiness(aircraft, {
      minimumBatteryPercent: 40,
    });

    expect(report.readyForPropsOffBench).toBe(false);
    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.some((check) => check.id === "battery" && check.status === "fail")).toBe(true);
  });

  it("fails when required RTK FIX is unavailable", async () => {
    const aircraft = new SimulatorAircraftAdapter({
      batteryPercent: 90,
      satellites: 18,
      gnssQuality: "good",
      rtkState: "float",
      homeLatitude: 39.95,
      homeLongitude: -75.16,
    });

    const report = await runBenchReadiness(aircraft, {
      requireRtkFixed: true,
    });

    expect(report.readyForPropOnFieldTest).toBe(false);
    expect(report.checks.some((check) => check.id === "rtk" && check.status === "fail")).toBe(true);
  });

  it("fails autonomous readiness when a required capability is missing", async () => {
    const aircraft = new SimulatorAircraftAdapter({
      batteryPercent: 90,
      satellites: 18,
      gnssQuality: "good",
      homeLatitude: 39.95,
      homeLongitude: -75.16,
    });
    Object.assign(aircraft.capabilities, { returnHome: false });

    const report = await runBenchReadiness(aircraft);

    expect(report.readyForPropsOffBench).toBe(false);
    expect(
      report.checks.find((check) => check.id === "capabilities")?.message,
    ).toContain("returnHome");
  });
});
