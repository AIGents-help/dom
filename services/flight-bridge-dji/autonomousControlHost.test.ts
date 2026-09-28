import { describe, expect, it } from "vitest";
import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import { createDjiAutonomousControlFlightBridgeHost } from "./autonomousControlHost";
import type {
  DjiAutonomousControlSource,
  DjiAutonomyAuthorization,
} from "./autonomousControlDriver";

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
    aircraftId: "m4e-autonomy-stage",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 0,
    headingDeg: 180,
    batteryPercent: 90,
    satellites: 24,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -20,
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

  const source: DjiAutonomousControlSource = {
    supportsRtk: true,
    supportsObstacleSensing: true,
    supportsGimbalControl: true,
    supportsPhotoCapture: true,
    supportsVideoCapture: true,
    supportsPauseResume: true,
    supportsReturnHome: true,
    supportsLand: true,
    supportsAbort: true,
    supportsArm: true,
    supportsTakeoff: true,
    supportsGoTo: true,
    supportsVelocityControl: true,
    supportsYawControl: true,
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
    async arm() { calls.push("arm"); },
    async takeoff(altitudeFt) { calls.push(`takeoff:${altitudeFt}`); },
    async goTo(input) { calls.push(`goto:${input.latitude.toFixed(4)},${input.longitude.toFixed(4)}`); },
    async setVelocity(input) { calls.push(`velocity:${input.northFps},${input.eastFps},${input.downFps}`); },
    async setYaw(headingDeg) { calls.push(`yaw:${headingDeg}`); },
  };

  return { source, calls };
}

function validAuthorization(): DjiAutonomyAuthorization {
  const now = Date.now();
  return {
    aircraftId: "m4e-autonomy-stage",
    controlledFieldValidated: true,
    operatorConfirmed: true,
    authorizedAtMs: now - 1000,
    expiresAtMs: now + 10 * 60_000,
  };
}

describe("DJI autonomy unlock hardware stage", () => {
  it("advertises movement only for a valid aircraft-specific authorization", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiAutonomousControlFlightBridgeHost(
      fake.source,
      validAuthorization(),
      socket,
      {
        bridgeId: "m4e-autonomy-stage",
        adapterVersion: "0.5.0-autonomy",
        heartbeatIntervalMs: 60_000,
      },
    );

    await host.start();

    const hello = socket.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "hello");
    expect(hello.capabilities.arm).toBe(true);
    expect(hello.capabilities.takeoff).toBe(true);
    expect(hello.capabilities.goTo).toBe(true);
    expect(hello.capabilities.velocityControl).toBe(true);
    expect(hello.capabilities.yawControl).toBe(true);
    expect(hello.capabilities.returnHome).toBe(true);

    await host.stop();
  });

  it("routes authorized movement commands into the native source", async () => {
    const fake = makeSource();
    const socket = new FakeSocket();
    const host = createDjiAutonomousControlFlightBridgeHost(
      fake.source,
      validAuthorization(),
      socket,
      {
        bridgeId: "m4e-autonomy-stage",
        adapterVersion: "0.5.0-autonomy",
        heartbeatIntervalMs: 60_000,
      },
    );
    await host.start();

    const commands = [
      ["arm-1", { type: "arm" }],
      ["takeoff-1", { type: "takeoff", altitudeFt: 25 }],
      ["goto-1", {
        type: "goTo",
        latitude: 39.951,
        longitude: -75.161,
        relativeAltitudeFt: 35,
        speedFps: 10,
      }],
      ["yaw-1", { type: "setYaw", headingDeg: 270 }],
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

    expect(fake.calls).toContain("arm");
    expect(fake.calls).toContain("takeoff:25");
    expect(fake.calls).toContain("goto:39.9510,-75.1610");
    expect(fake.calls).toContain("yaw:270");

    const results = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "command_result");

    expect(results.find((message) => message.requestId === "arm-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "takeoff-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "goto-1")?.result.accepted).toBe(true);
    expect(results.find((message) => message.requestId === "yaw-1")?.result.accepted).toBe(true);

    await host.stop();
  });

  it("keeps movement locked when authorization is expired or for another aircraft", async () => {
    const fake = makeSource();
    const now = Date.now();
    const authorization: DjiAutonomyAuthorization = {
      aircraftId: "different-aircraft",
      controlledFieldValidated: true,
      operatorConfirmed: true,
      authorizedAtMs: now - 10_000,
      expiresAtMs: now - 1,
    };
    const socket = new FakeSocket();
    const host = createDjiAutonomousControlFlightBridgeHost(
      fake.source,
      authorization,
      socket,
      {
        bridgeId: "m4e-autonomy-stage",
        adapterVersion: "0.5.0-autonomy",
        heartbeatIntervalMs: 60_000,
      },
    );
    await host.start();

    const hello = socket.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "hello");
    expect(hello.capabilities.arm).toBe(false);
    expect(hello.capabilities.takeoff).toBe(false);
    expect(hello.capabilities.goTo).toBe(false);

    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "locked-takeoff",
      command: { type: "takeoff", altitudeFt: 20 },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "command_result" && message.requestId === "locked-takeoff");
    expect(result.result.accepted).toBe(false);

    await host.stop();
  });

  it("re-checks authorization at command time so an expired unlock cannot keep flying", async () => {
    const fake = makeSource();
    const authorization = validAuthorization();
    const socket = new FakeSocket();
    const host = createDjiAutonomousControlFlightBridgeHost(
      fake.source,
      authorization,
      socket,
      {
        bridgeId: "m4e-autonomy-stage",
        adapterVersion: "0.5.0-autonomy",
        heartbeatIntervalMs: 60_000,
      },
    );
    await host.start();

    authorization.expiresAtMs = Date.now() - 1;
    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "expired-goto",
      command: {
        type: "goTo",
        latitude: 39.952,
        longitude: -75.162,
        relativeAltitudeFt: 30,
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "command_result" && message.requestId === "expired-goto");
    expect(result.result.accepted).toBe(false);
    expect(fake.calls.some((call) => call.startsWith("goto:"))).toBe(false);

    await host.stop();
  });
});
