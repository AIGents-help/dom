import { describe, expect, it } from "vitest";
import {
  DjiAircraftAdapter,
  type DjiSdkDriver,
  type DjiSdkSnapshot,
} from "@/lib/aircraft/djiAdapter";

function snapshot(): DjiSdkSnapshot {
  return {
    aircraftId: "dji-m4e-1",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 12,
    headingDeg: 180,
    batteryPercent: 91,
    satellites: 22,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -25,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "P-GPS",
    homeLatitude: 39.9499,
    homeLongitude: -75.1601,
    failsafe: null,
    timestampMs: 1000,
  };
}

function makeDriver() {
  const calls: string[] = [];
  const listeners = new Set<(state: DjiSdkSnapshot) => void>();
  let state = snapshot();

  const driver: DjiSdkDriver = {
    capabilities: {
      telemetry: true,
      arm: true,
      takeoff: true,
      goTo: true,
      velocityControl: true,
      yawControl: true,
      gimbalControl: true,
      photoCapture: true,
      videoCapture: true,
      pauseResume: true,
      returnHome: true,
      land: true,
      obstacleSensing: true,
      rtk: true,
    },
    async connect() { calls.push("connect"); },
    async disconnect() { calls.push("disconnect"); },
    getSnapshot() { return { ...state }; },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },
    async arm() { calls.push("arm"); },
    async takeoff(altitudeFt) { calls.push(`takeoff:${altitudeFt}`); },
    async goTo(input) { calls.push(`goto:${input.latitude.toFixed(4)}`); },
    async setVelocity() { calls.push("velocity"); },
    async setYaw(headingDeg) { calls.push(`yaw:${headingDeg}`); },
    async setGimbal(input) { calls.push(`gimbal:${input.pitchDeg}`); },
    async capturePhoto() { calls.push("photo"); },
    async startVideo() { calls.push("video-start"); },
    async stopVideo() { calls.push("video-stop"); },
    async pause() { calls.push("pause"); },
    async resume() { calls.push("resume"); },
    async returnHome() { calls.push("rth"); },
    async land() { calls.push("land"); },
    async abort(reason) { calls.push(`abort:${reason}`); },
  };

  return { driver, calls };
}

describe("DOMINIC DJI adapter", () => {
  it("normalizes DJI SDK telemetry into the universal aircraft state", async () => {
    const fake = makeDriver();
    const adapter = new DjiAircraftAdapter(fake.driver);
    await adapter.connect();

    const state = adapter.getState();
    expect(state.vendor).toBe("dji");
    expect(state.model).toBe("Matrice 4E");
    expect(state.rtkState).toBe("fixed");
    expect(state.gimbalPitchDeg).toBe(-25);
  });

  it("maps universal commands into the DJI SDK driver boundary", async () => {
    const fake = makeDriver();
    const adapter = new DjiAircraftAdapter(fake.driver);
    await adapter.connect();

    expect((await adapter.send({ type: "takeoff", altitudeFt: 25 })).accepted).toBe(true);
    expect((await adapter.send({
      type: "goTo",
      latitude: 39.951,
      longitude: -75.161,
      relativeAltitudeFt: 35,
    })).accepted).toBe(true);
    expect((await adapter.send({ type: "setYaw", headingDeg: 270 })).accepted).toBe(true);
    expect((await adapter.send({ type: "setGimbal", pitchDeg: -35 })).accepted).toBe(true);
    expect((await adapter.send({ type: "capturePhoto" })).accepted).toBe(true);
    expect((await adapter.send({ type: "returnHome" })).accepted).toBe(true);

    expect(fake.calls).toContain("takeoff:25");
    expect(fake.calls).toContain("yaw:270");
    expect(fake.calls).toContain("gimbal:-35");
    expect(fake.calls).toContain("photo");
    expect(fake.calls).toContain("rth");
  });

  it("capability-gates DJI commands instead of assuming all models support them", async () => {
    const fake = makeDriver();
    fake.driver.capabilities.gimbalControl = false;
    const adapter = new DjiAircraftAdapter(fake.driver);

    const result = await adapter.send({ type: "setGimbal", pitchDeg: -15 });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain("does not support");
  });
});
