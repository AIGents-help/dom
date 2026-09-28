import { describe, expect, it } from "vitest";
import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import { createDjiPayloadControlFlightBridgeHost } from "./payloadControlHost";
import type { DjiPayloadControlSource } from "./payloadControlDriver";

class FakeSocket implements BridgeTextSocket {
  connected = true;
  sent: string[] = [];
  private textListeners = new Set<(data: string) => void>();
  private closeListeners = new Set<() => void>();

  sendText(data: string) { this.sent.push(data); }
  subscribeText(listener: (data: string) => void) {
    this.textListeners.add(listener);
    return () => this.textListeners.delete(listener);
  }
  subscribeClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  receive(data: string) {
    for (const listener of this.textListeners) listener(data);
  }
  async close() {
    this.connected = false;
    for (const listener of this.closeListeners) listener();
  }
}

function snapshot(): DjiSdkSnapshot {
  return {
    aircraftId: "m4e-payload-stage",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 0,
    headingDeg: 180,
    batteryPercent: 94,
    satellites: 23,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -10,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "P-GPS",
    homeLatitude: 39.95,
    homeLongitude: -75.16,
    failsafe: null,
    timestampMs: 1000,
  };
}

function makeSource() {
  const calls: string[] = [];
  const state = snapshot();
  const stateListeners = new Set<(next: DjiSdkSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();

  const source: DjiPayloadControlSource = {
    supportsRtk: true,
    supportsObstacleSensing: true,
    supportsGimbalControl: true,
    supportsPhotoCapture: true,
    supportsVideoCapture: true,
    payloads: [{
      id: "m4e-wide",
      name: "Matrice 4E Wide RGB",
      kind: "rgb",
      horizontalFovDeg: 82,
      verticalFovDeg: 61,
      supportsPhoto: true,
      supportsVideo: true,
      supportsGimbalPitch: true,
      supportsGimbalYaw: true,
    }],
    activePayloadId: "m4e-wide",
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
    async setGimbal(input) { calls.push(`gimbal:${input.pitchDeg}`); },
    async capturePhoto() {
      calls.push("photo");
      for (const listener of mediaListeners) {
        listener({
          id: "payload-photo-1",
          aircraftId: state.aircraftId,
          capturedAtMs: 2000,
          mimeType: "image/jpeg",
          mediaUrl: "http://127.0.0.1:8788/media/payload-photo-1.jpg",
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
  };

  return { source, calls };
}

describe("DJI payload-control hardware stage", () => {
  it("advertises payload controls while movement remains disabled", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiPayloadControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-payload-stage",
      adapterVersion: "0.3.0-payload",
      heartbeatIntervalMs: 60_000,
    });

    await host.start();

    const hello = socket.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "hello");
    expect(hello.capabilities.telemetry).toBe(true);
    expect(hello.capabilities.gimbalControl).toBe(true);
    expect(hello.capabilities.photoCapture).toBe(true);
    expect(hello.capabilities.videoCapture).toBe(true);
    expect(hello.capabilities.arm).toBe(false);
    expect(hello.capabilities.takeoff).toBe(false);
    expect(hello.capabilities.goTo).toBe(false);
    expect(hello.capabilities.returnHome).toBe(false);
    expect(hello.activePayloadId).toBe("m4e-wide");

    await host.stop();
  });

  it("routes gimbal and camera commands but rejects aircraft movement", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiPayloadControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-payload-stage",
      adapterVersion: "0.3.0-payload",
      heartbeatIntervalMs: 60_000,
    });
    await host.start();

    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "gimbal-1",
      command: { type: "setGimbal", pitchDeg: -35 },
    }));
    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "takeoff-1",
      command: { type: "takeoff", altitudeFt: 20 },
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.calls).toContain("gimbal:-35");
    expect(
      socket.sent.map((raw) => JSON.parse(raw)).some(
        (message) =>
          message.type === "command_result" &&
          message.requestId === "gimbal-1" &&
          message.result.accepted === true,
      ),
    ).toBe(true);
    expect(
      socket.sent.map((raw) => JSON.parse(raw)).some(
        (message) =>
          message.type === "command_result" &&
          message.requestId === "takeoff-1" &&
          message.result.accepted === false,
      ),
    ).toBe(true);

    await host.stop();
  });

  it("forwards captured DJI media with the originating DOMINIC checkpoint", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiPayloadControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-payload-stage",
      adapterVersion: "0.3.0-payload",
      heartbeatIntervalMs: 60_000,
    });
    await host.start();

    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "photo-1",
      command: { type: "capturePhoto", checkpointId: "object-ring-1-shot-4" },
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const media = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "media_capture");
    expect(media.capture.id).toBe("payload-photo-1");
    expect(media.capture.checkpointId).toBe("object-ring-1-shot-4");

    await host.stop();
  });
});
