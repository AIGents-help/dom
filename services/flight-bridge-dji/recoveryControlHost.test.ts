import { describe, expect, it } from "vitest";
import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import { createDjiRecoveryControlFlightBridgeHost } from "./recoveryControlHost";
import type { DjiRecoveryControlSource } from "./recoveryControlDriver";

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
    aircraftId: "m4e-recovery-stage",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 25,
    headingDeg: 180,
    batteryPercent: 82,
    satellites: 22,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -30,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "P-GPS",
    homeLatitude: 39.95,
    homeLongitude: -75.16,
    failsafe: null,
    timestampMs: 1000,
  };
}

function makeSource(options: {
  pauseResume?: boolean;
  returnHome?: boolean;
  land?: boolean;
  abort?: boolean;
} = {}) {
  const calls: string[] = [];
  const state = snapshot();
  const stateListeners = new Set<(next: DjiSdkSnapshot) => void>();
  const mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();

  const source: DjiRecoveryControlSource = {
    supportsRtk: true,
    supportsObstacleSensing: true,
    supportsGimbalControl: true,
    supportsPhotoCapture: true,
    supportsVideoCapture: true,
    supportsPauseResume: options.pauseResume ?? true,
    supportsReturnHome: options.returnHome ?? true,
    supportsLand: options.land ?? true,
    supportsAbort: options.abort ?? true,
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
    async capturePhoto() { calls.push("photo"); },
    async startVideo() { calls.push("video-start"); },
    async stopVideo() { calls.push("video-stop"); },
    async pause() { calls.push("pause"); },
    async resume() { calls.push("resume"); },
    async returnHome() { calls.push("rth"); },
    async land() { calls.push("land"); },
    async abort(reason) { calls.push(`abort:${reason}`); },
  };

  return { source, calls };
}

describe("DJI recovery-control hardware stage", () => {
  it("advertises recovery controls but keeps autonomous movement disabled", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiRecoveryControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-recovery-stage",
      adapterVersion: "0.4.0-recovery",
      heartbeatIntervalMs: 60_000,
    });

    await host.start();

    const hello = socket.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "hello");
    expect(hello.capabilities.pauseResume).toBe(true);
    expect(hello.capabilities.returnHome).toBe(true);
    expect(hello.capabilities.land).toBe(true);
    expect(hello.capabilities.gimbalControl).toBe(true);
    expect(hello.capabilities.photoCapture).toBe(true);
    expect(hello.capabilities.arm).toBe(false);
    expect(hello.capabilities.takeoff).toBe(false);
    expect(hello.capabilities.goTo).toBe(false);
    expect(hello.capabilities.velocityControl).toBe(false);
    expect(hello.capabilities.yawControl).toBe(false);

    await host.stop();
  });

  it("routes pause/RTH/land/abort while rejecting go-to", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiRecoveryControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-recovery-stage",
      adapterVersion: "0.4.0-recovery",
      heartbeatIntervalMs: 60_000,
    });
    await host.start();

    const commands = [
      ["pause-1", { type: "pause" }],
      ["rth-1", { type: "returnHome" }],
      ["land-1", { type: "land" }],
      ["abort-1", { type: "abort", reason: "operator recovery test" }],
      ["goto-1", {
        type: "goTo",
        latitude: 39.951,
        longitude: -75.161,
        relativeAltitudeFt: 30,
      }],
    ] as const;

    for (const [requestId, command] of commands) {
      socket.receive(JSON.stringify({
        type: "command",
        protocol: "dominic.flight-bridge.v1",
        requestId,
        command,
      }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.calls).toContain("pause");
    expect(fake.calls).toContain("rth");
    expect(fake.calls).toContain("land");
    expect(fake.calls).toContain("abort:operator recovery test");

    const results = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "command_result");

    expect(results.find((message) => message.requestId === "pause-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "rth-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "land-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "abort-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "goto-1")?.result.accepted).toBe(false);

    await host.stop();
  });

  it("refuses recovery commands that the native source has not explicitly enabled", async () => {
    const fake = makeSource({
      pauseResume: false,
      returnHome: false,
      land: false,
      abort: false,
    });

    const socket = new FakeSocket();
    const host = createDjiRecoveryControlFlightBridgeHost(fake.source, socket, {
      bridgeId: "m4e-recovery-stage",
      adapterVersion: "0.4.0-recovery",
      heartbeatIntervalMs: 60_000,
    });
    await host.start();

    for (const [requestId, command] of [
      ["pause-disabled", { type: "pause" }],
      ["rth-disabled", { type: "returnHome" }],
      ["land-disabled", { type: "land" }],
      ["abort-disabled", { type: "abort", reason: "should reject" }],
    ] as const) {
      socket.receive(JSON.stringify({
        type: "command",
        protocol: "dominic.flight-bridge.v1",
        requestId,
        command,
      }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "command_result");

    expect(results.find((message) => message.requestId === "pause-disabled")?.result.accepted).toBe(false);
    expect(results.find((message) => message.requestId === "rth-disabled")?.result.accepted).toBe(false);
    expect(results.find((message) => message.requestId === "land-disabled")?.result.accepted).toBe(false);
    expect(results.find((message) => message.requestId === "abort-disabled")?.result.accepted).toBe(false);

    await host.stop();
  });
});
