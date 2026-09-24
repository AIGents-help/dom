import { describe, expect, it } from "vitest";
import type { UniversalMediaCapture } from "@/lib/aircraft/contract";
import {
  MavlinkAircraftAdapter,
  type MavlinkDriver,
  type MavlinkVehicleSnapshot,
} from "@/lib/aircraft/mavlinkAdapter";

function makeSnapshot(): MavlinkVehicleSnapshot {
  return {
    vehicleId: "mav-1",
    model: "PX4 SITL",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 10,
    headingDeg: 90,
    groundSpeedFps: 5,
    verticalSpeedFps: 0,
    batteryPercent: 87,
    satellites: 18,
    gnssQuality: "good",
    rtkState: "unsupported",
    gimbalPitchDeg: -10,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "POSCTL",
    homeLatitude: 39.9499,
    homeLongitude: -75.1601,
    failsafe: null,
    timestampMs: 1000,
  };
}

function makeDriver() {
  let snapshot = makeSnapshot();
  const calls: string[] = [];
  const listeners = new Set<(snapshot: MavlinkVehicleSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();

  const driver: MavlinkDriver = {
    capabilities: {
      telemetry: true,
      arm: true,
      takeoff: true,
      gotoGlobal: true,
      velocitySetpoint: true,
      yawSetpoint: true,
      gimbalPitchYaw: true,
      imageCapture: true,
      videoCapture: true,
      pauseResume: true,
      returnToLaunch: true,
      land: true,
      obstacleTelemetry: false,
      rtkTelemetry: false,
    },
    async connect() { calls.push("connect"); },
    async disconnect() { calls.push("disconnect"); },
    getSnapshot() { return { ...snapshot }; },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...snapshot });
      return () => listeners.delete(listener);
    },
    subscribeMedia(listener) {
      mediaListeners.add(listener);
      return () => mediaListeners.delete(listener);
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
    async returnToLaunch() { calls.push("rtl"); },
    async land() { calls.push("land"); },
    async abort(reason) { calls.push(`abort:${reason}`); },
  };

  return {
    driver,
    calls,
    publish(patch: Partial<MavlinkVehicleSnapshot>) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener({ ...snapshot });
    },
    publishMedia(capture: UniversalMediaCapture) {
      for (const listener of mediaListeners) listener({ ...capture });
    },
  };
}

describe("DOMINIC MAVLink adapter", () => {
  it("normalizes MAVLink vehicle state into the universal aircraft contract", async () => {
    const fake = makeDriver();
    const adapter = new MavlinkAircraftAdapter(fake.driver);

    await adapter.connect();
    const state = adapter.getState();

    expect(state.vendor).toBe("mavlink");
    expect(state.model).toBe("PX4 SITL");
    expect(state.batteryPercent).toBe(87);
    expect(state.gimbalPitchDeg).toBe(-10);
    expect(adapter.capabilities.goTo).toBe(true);
    expect(adapter.capabilities.rtk).toBe(false);
  });

  it("maps universal DOMINIC commands into the MAVLink driver boundary", async () => {
    const fake = makeDriver();
    const adapter = new MavlinkAircraftAdapter(fake.driver);
    await adapter.connect();

    expect((await adapter.send({ type: "arm" })).accepted).toBe(true);
    expect((await adapter.send({ type: "takeoff", altitudeFt: 30 })).accepted).toBe(true);
    expect((await adapter.send({
      type: "goTo",
      latitude: 39.951,
      longitude: -75.161,
      relativeAltitudeFt: 40,
    })).accepted).toBe(true);
    expect((await adapter.send({ type: "setGimbal", pitchDeg: -35 })).accepted).toBe(true);
    expect((await adapter.send({ type: "capturePhoto" })).accepted).toBe(true);
    expect((await adapter.send({ type: "returnHome" })).accepted).toBe(true);

    expect(fake.calls).toContain("arm");
    expect(fake.calls).toContain("takeoff:30");
    expect(fake.calls).toContain("gimbal:-35");
    expect(fake.calls).toContain("photo");
    expect(fake.calls).toContain("rtl");
  });

  it("rejects commands that the connected MAVLink implementation does not expose", async () => {
    const fake = makeDriver();
    fake.driver.capabilities.gimbalPitchYaw = false;
    const adapter = new MavlinkAircraftAdapter(fake.driver);

    const result = await adapter.send({ type: "setGimbal", pitchDeg: -20 });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain("does not support");
  });

  it("forwards vendor camera media into the universal capture stream", async () => {
    const fake = makeDriver();
    const adapter = new MavlinkAircraftAdapter(fake.driver);
    const received: UniversalMediaCapture[] = [];
    adapter.subscribeMedia((capture) => received.push(capture));
    await adapter.connect();

    fake.publishMedia({
      id: "photo-42",
      aircraftId: "mav-1",
      capturedAtMs: 2000,
      mimeType: "image/jpeg",
      mediaUrl: "http://127.0.0.1:8788/media/photo-42.jpg",
      latitude: 39.95,
      longitude: -75.16,
      relativeAltitudeFt: 30,
      headingDeg: 180,
      gimbalPitchDeg: -25,
    });

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("photo-42");
    expect(received[0].mediaUrl).toContain("photo-42.jpg");
  });
});
