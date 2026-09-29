import { describe, expect, it } from "vitest";
import type { FlightBridgeMessage } from "../../lib/aircraft/bridgeProtocol";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type {
  AutelSdkDriver,
  AutelSdkSnapshot,
} from "../../lib/aircraft/autelAdapter";
import { createAutelFlightBridgeSession } from "./session";

function makeSnapshot(): AutelSdkSnapshot {
  return {
    aircraftId: "autel-evo-field-1",
    model: "Autel EVO Enterprise",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 18,
    headingDeg: 90,
    batteryPercent: 86,
    satellites: 18,
    gnssQuality: "good",
    rtkState: "unsupported",
    gimbalPitchDeg: -25,
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
  const state = makeSnapshot();
  const calls: string[] = [];
  const stateListeners = new Set<(snapshot: AutelSdkSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();

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
    payloads: [{
      id: "autel-wide-rgb",
      name: "Autel Wide RGB",
      kind: "rgb",
      horizontalFovDeg: 82,
      verticalFovDeg: 61,
      supportsPhoto: true,
      supportsVideo: true,
      supportsGimbalPitch: true,
      supportsGimbalYaw: true,
    }],
    activePayloadId: "autel-wide-rgb",
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
          id: "autel-photo-1",
          aircraftId: state.aircraftId,
          capturedAtMs: 2000,
          mimeType: "image/jpeg",
          mediaUrl: "http://127.0.0.1:8788/media/autel-photo-1.jpg",
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

describe("Autel Flight Bridge session", () => {
  it("advertises Autel capabilities and active payload metadata", async () => {
    const fake = makeDriver();
    const { session } = createAutelFlightBridgeSession(fake.driver, {
      bridgeId: "autel-bridge-test",
      adapterVersion: "0.1.0",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    const unsubscribe = session.subscribe((message) => messages.push(message));

    await session.start();

    const hello = messages.find((message) => message.type === "hello");
    expect(hello?.type).toBe("hello");
    if (hello?.type === "hello") {
      expect(hello.vendor).toBe("autel");
      expect(hello.model).toBe("Autel EVO Enterprise");
      expect(hello.activePayloadId).toBe("autel-wide-rgb");
      expect(hello.payloads?.[0]?.name).toBe("Autel Wide RGB");
    }

    unsubscribe();
    await session.stop();
  });

  it("routes DOMINIC commands into the Autel driver", async () => {
    const fake = makeDriver();
    const { session } = createAutelFlightBridgeSession(fake.driver, {
      bridgeId: "autel-bridge-test",
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
      command: { type: "setGimbal", pitchDeg: -35 },
    });

    expect(fake.calls).toContain("gimbal:-35");
    const result = messages.find(
      (message) => message.type === "command_result" && message.requestId === "req-gimbal",
    );
    expect(result?.type).toBe("command_result");
    if (result?.type === "command_result") expect(result.result.accepted).toBe(true);

    await session.stop();
  });

  it("preserves checkpoint IDs on Autel media capture events", async () => {
    const fake = makeDriver();
    const { session } = createAutelFlightBridgeSession(fake.driver, {
      bridgeId: "autel-bridge-test",
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
      command: { type: "capturePhoto", checkpointId: "facade-3" },
    });

    const media = messages.find((message) => message.type === "media_capture");
    expect(media?.type).toBe("media_capture");
    if (media?.type === "media_capture") {
      expect(media.capture.id).toBe("autel-photo-1");
      expect(media.capture.checkpointId).toBe("facade-3");
    }

    await session.stop();
  });
});
