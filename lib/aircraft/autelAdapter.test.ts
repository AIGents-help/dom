import { describe, expect, it } from "vitest";
import type { UniversalMediaCapture } from "@/lib/aircraft/contract";
import {
  AutelAircraftAdapter,
  type AutelSdkDriver,
  type AutelSdkSnapshot,
} from "@/lib/aircraft/autelAdapter";

function snapshot(): AutelSdkSnapshot {
  return {
    aircraftId: "autel-evo-1",
    model: "Autel Enterprise Aircraft",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 14,
    headingDeg: 45,
    batteryPercent: 84,
    satellites: 19,
    gnssQuality: "good",
    rtkState: "unsupported",
    gimbalPitchDeg: -20,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "GPS",
    homeLatitude: 39.9499,
    homeLongitude: -75.1601,
    failsafe: null,
    timestampMs: 1000,
  };
}

function makeDriver() {
  const calls: string[] = [];
  const listeners = new Set<(state: AutelSdkSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();
  const state = snapshot();

  const driver: AutelSdkDriver = {
    capabilities: {
      telemetry: true,
      arm: true,
      takeoff: true,
      goTo: true,
      velocityControl: false,
      yawControl: true,
      gimbalControl: true,
      photoCapture: true,
      videoCapture: true,
      pauseResume: true,
      returnHome: true,
      land: true,
      obstacleSensing: true,
      rtk: false,
    },
    async connect() { calls.push("connect"); },
    async disconnect() { calls.push("disconnect"); },
    getSnapshot() { return { ...state }; },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state });
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
    async returnHome() { calls.push("rth"); },
    async land() { calls.push("land"); },
    async abort(reason) { calls.push(`abort:${reason}`); },
  };

  return {
    driver,
    calls,
    publishMedia(capture: UniversalMediaCapture) {
      for (const listener of mediaListeners) listener({ ...capture });
    },
  };
}

describe("DOMINIC Autel adapter", () => {
  it("normalizes Autel SDK telemetry into the universal aircraft state", async () => {
    const fake = makeDriver();
    const adapter = new AutelAircraftAdapter(fake.driver);
    await adapter.connect();

    const state = adapter.getState();
    expect(state.vendor).toBe("autel");
    expect(state.model).toBe("Autel Enterprise Aircraft");
    expect(state.batteryPercent).toBe(84);
    expect(state.gimbalPitchDeg).toBe(-20);
  });

  it("maps universal commands into the Autel SDK driver boundary", async () => {
    const fake = makeDriver();
    const adapter = new AutelAircraftAdapter(fake.driver);
    await adapter.connect();

    expect((await adapter.send({ type: "takeoff", altitudeFt: 22 })).accepted).toBe(true);
    expect((await adapter.send({
      type: "goTo",
      latitude: 39.951,
      longitude: -75.161,
      relativeAltitudeFt: 32,
    })).accepted).toBe(true);
    expect((await adapter.send({ type: "setGimbal", pitchDeg: -30 })).accepted).toBe(true);
    expect((await adapter.send({ type: "capturePhoto" })).accepted).toBe(true);
    expect((await adapter.send({ type: "returnHome" })).accepted).toBe(true);

    expect(fake.calls).toContain("takeoff:22");
    expect(fake.calls).toContain("gimbal:-30");
    expect(fake.calls).toContain("photo");
    expect(fake.calls).toContain("rth");
  });

  it("rejects unsupported features per connected Autel aircraft", async () => {
    const fake = makeDriver();
    const adapter = new AutelAircraftAdapter(fake.driver);

    const result = await adapter.send({
      type: "setVelocity",
      northFps: 5,
      eastFps: 0,
      downFps: 0,
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toContain("does not support");
  });

  it("forwards vendor camera media into the universal capture stream", async () => {
    const fake = makeDriver();
    const adapter = new AutelAircraftAdapter(fake.driver);
    const received: UniversalMediaCapture[] = [];
    adapter.subscribeMedia((capture) => received.push(capture));
    await adapter.connect();

    fake.publishMedia({
      id: "photo-42",
      aircraftId: "autel-evo-1",
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
