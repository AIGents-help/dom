import { describe, expect, it } from "vitest";
import type { FlightBridgeMessage } from "../../lib/aircraft/bridgeProtocol";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type {
  DjiSdkDriver,
  DjiSdkSnapshot,
} from "../../lib/aircraft/djiAdapter";
import { createDjiFlightBridgeSession } from "./session";

function makeSnapshot(): DjiSdkSnapshot {
  return {
    aircraftId: "dji-m4e-field-1",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 18,
    headingDeg: 90,
    batteryPercent: 88,
    satellites: 21,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -30,
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
  const state = makeSnapshot();
  const calls: string[] = [];
  const stateListeners = new Set<(snapshot: DjiSdkSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();

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
    payloads: [{
      id: "m4e-wide-rgb",
      name: "Matrice 4E Wide RGB",
      kind: "rgb",
      horizontalFovDeg: 82,
      verticalFovDeg: 61,
      imageWidthPx: 5280,
      imageHeightPx: 3956,
      supportsPhoto: true,
      supportsVideo: true,
      supportsGimbalPitch: true,
      supportsGimbalYaw: true,
    }],
    activePayloadId: "m4e-wide-rgb",
    async connect() { calls.push("connect"); },
    async disconnect() { calls.push("disconnect"); },
    getSnapshot() { return { ...state }; },
    subscribe(listener) {
      stateListeners.add(listener);
      listener({ ...state });
      return () => stateListeners.delete(listener);
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
    async capturePhoto() {
      calls.push("photo");
      for (const listener of mediaListeners) {
        listener({
          id: "dji-photo-1",
          aircraftId: state.aircraftId,
          capturedAtMs: 2000,
          mimeType: "image/jpeg",
          mediaUrl: "http://127.0.0.1:8788/media/dji-photo-1.jpg",
          latitude: state.latitude,
          longitude: state.longitude,
          relativeAltitudeFt: state.relativeAltitudeFt,
          headingDeg: state.headingDeg,
          gimbalPitchDeg: state.gimbalPitchDeg ?? 0,
        });
      }
    },
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

describe("DJI native Flight Bridge session", () => {
  it("advertises DJI capabilities and active camera payload in the bridge hello", async () => {
    const fake = makeDriver();
    const { session } = createDjiFlightBridgeSession(fake.driver, {
      bridgeId: "dji-bridge-test",
      adapterVersion: "0.1.0",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    const unsubscribe = session.subscribe((message) => messages.push(message));

    await session.start();

    const hello = messages.find((message) => message.type === "hello");
    expect(hello?.type).toBe("hello");
    if (hello?.type === "hello") {
      expect(hello.vendor).toBe("dji");
      expect(hello.model).toBe("Matrice 4E");
      expect(hello.capabilities.rtk).toBe(true);
      expect(hello.activePayloadId).toBe("m4e-wide-rgb");
      expect(hello.payloads?.[0]?.name).toBe("Matrice 4E Wide RGB");
    }

    unsubscribe();
    await session.stop();
  });

  it("routes DOMINIC commands into the DJI driver and returns command results", async () => {
    const fake = makeDriver();
    const { session } = createDjiFlightBridgeSession(fake.driver, {
      bridgeId: "dji-bridge-test",
      adapterVersion: "0.1.0",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    await session.receive({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "req-gimbal",
      command: { type: "setGimbal", pitchDeg: -42 },
    });

    expect(fake.calls).toContain("gimbal:-42");
    const result = messages.find(
      (message) => message.type === "command_result" && message.requestId === "req-gimbal",
    );
    expect(result?.type).toBe("command_result");
    if (result?.type === "command_result") expect(result.result.accepted).toBe(true);

    await session.stop();
  });

  it("attaches checkpoint identity to DJI media emitted for a capture command", async () => {
    const fake = makeDriver();
    const { session } = createDjiFlightBridgeSession(fake.driver, {
      bridgeId: "dji-bridge-test",
      adapterVersion: "0.1.0",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    await session.receive({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "req-photo",
      command: { type: "capturePhoto", checkpointId: "ring-2-shot-7" },
    });

    const media = messages.find((message) => message.type === "media_capture");
    expect(media?.type).toBe("media_capture");
    if (media?.type === "media_capture") {
      expect(media.capture.id).toBe("dji-photo-1");
      expect(media.capture.checkpointId).toBe("ring-2-shot-7");
    }

    await session.stop();
  });
});
