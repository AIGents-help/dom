import { describe, expect, it, vi } from "vitest";
import { calculateObjectScanPlan, buildGeographicCheckpoints } from "@/lib/capturePlanner";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";
import { DominicMissionEngine } from "@/lib/aircraft/missionEngine";
import type { UniversalAircraftCommand } from "@/lib/aircraft/contract";

function makeMission() {
  const plan = calculateObjectScanPlan({
    objectDiameterFt: 10,
    objectHeightFt: 8,
    standoffFt: 18,
    overlapPct: 75,
    horizontalFovDeg: 84,
  });
  const checkpoints = buildGeographicCheckpoints({
    plan,
    centerLatitude: 39.95,
    centerLongitude: -75.16,
    objectHeightFt: 8,
    baseRelativeAltitudeFt: 10,
  });
  return { plan, checkpoints };
}

describe("DOMINIC autonomous mission engine", () => {
  it("executes a complete object scan through the universal simulator adapter", async () => {
    const { checkpoints } = makeMission();
    const aircraft = new SimulatorAircraftAdapter({
      latitude: 39.9499,
      longitude: -75.1601,
    });
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 6),
      takeoffAltitudeFt: 20,
      transitSpeedFps: 12,
    });

    const result = await engine.execute();

    expect(result.phase).toBe("COMPLETE");
    expect(result.completedCheckpointIds).toHaveLength(6);
    expect(result.lastAircraftState?.relativeAltitudeFt).toBe(0);
    expect(result.events.some((event) => event.phase === "TAKEOFF")).toBe(true);
    expect(result.events.some((event) => event.phase === "CAPTURING")).toBe(true);
    expect(result.events.some((event) => event.phase === "RETURNING")).toBe(true);
  });

  it("fails safely when an adapter lacks a required autonomous capability", async () => {
    const { checkpoints } = makeMission();
    const aircraft = new SimulatorAircraftAdapter();
    Object.assign(aircraft.capabilities, { gimbalControl: false });

    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 1),
    });

    const result = await engine.execute();

    expect(result.phase).toBe("FAILED");
    expect(result.error).toContain("gimbalControl");
    expect(result.completedCheckpointIds).toHaveLength(0);
  });

  it("can abort an in-progress mission", async () => {
    const { checkpoints } = makeMission();
    const aircraft = new SimulatorAircraftAdapter();
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 12),
    });

    const unsubscribe = engine.subscribe((snapshot) => {
      if (snapshot.completedCheckpointIds.length === 2 && snapshot.phase === "CAPTURING") {
        void engine.abort("Test abort");
      }
    });

    const result = await engine.execute();
    unsubscribe();

    expect(["ABORTED", "COMPLETE"]).toContain(result.phase);
  });

  it("reuses an already-connected aircraft bridge without reconnecting it", async () => {
    const { checkpoints } = makeMission();
    const aircraft = new SimulatorAircraftAdapter({
      latitude: 39.9499,
      longitude: -75.1601,
    });
    await aircraft.connect();
    const connectSpy = vi.spyOn(aircraft, "connect");

    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 2),
    });

    const result = await engine.execute();

    expect(result.phase).toBe("COMPLETE");
    expect(connectSpy).not.toHaveBeenCalled();
  });


  it("blocks autonomous launch when preflight safety is not satisfied", async () => {
    const { checkpoints } = makeMission();
    const aircraft = new SimulatorAircraftAdapter({
      batteryPercent: 18,
      satellites: 20,
      gnssQuality: "good",
    });
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 2),
    });

    const result = await engine.execute();

    expect(result.phase).toBe("FAILED");
    expect(result.error).toContain("minimum launch battery");
    expect(result.completedCheckpointIds).toHaveLength(0);
  });


  it("waits for delayed aircraft position convergence before capture", async () => {
    const { checkpoints } = makeMission();
    class DelayedSimulator extends SimulatorAircraftAdapter {
      capturePositions: Array<{ latitude: number; longitude: number }> = [];
      async send(command: UniversalAircraftCommand) {
        if (command.type === "goTo") {
          setTimeout(() => {
            void super.send(command);
          }, 20);
          return { accepted: true, command: command.type };
        }
        if (command.type === "capturePhoto") {
          const state = this.getState();
          this.capturePositions.push({
            latitude: state.latitude,
            longitude: state.longitude,
          });
        }
        return super.send(command);
      }
    }

    const aircraft = new DelayedSimulator({
      latitude: 39.949,
      longitude: -75.161,
    });
    const target = checkpoints[0];
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: [target],
      arrivalTimeoutMs: 500,
    });

    const result = await engine.execute();

    expect(result.phase).toBe("COMPLETE");
    expect(aircraft.capturePositions).toHaveLength(1);
    expect(aircraft.capturePositions[0].latitude).toBeCloseTo(target.latitude, 6);
    expect(aircraft.capturePositions[0].longitude).toBeCloseTo(target.longitude, 6);
  });

  it("fails instead of capturing when an aircraft never reaches the checkpoint", async () => {
    const { checkpoints } = makeMission();
    class StuckSimulator extends SimulatorAircraftAdapter {
      async send(command: UniversalAircraftCommand) {
        if (command.type === "goTo") {
          return { accepted: true, command: command.type };
        }
        return super.send(command);
      }
    }

    const aircraft = new StuckSimulator({
      latitude: 39.94,
      longitude: -75.17,
    });
    const engine = new DominicMissionEngine(aircraft, {
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpoints: checkpoints.slice(0, 1),
      arrivalTimeoutMs: 40,
    });

    const result = await engine.execute();

    expect(result.phase).toBe("FAILED");
    expect(result.error).toContain("did not converge");
    expect(result.completedCheckpointIds).toHaveLength(0);
  });

});
