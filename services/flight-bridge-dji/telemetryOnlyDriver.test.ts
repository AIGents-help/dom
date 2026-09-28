import { describe, expect, it } from "vitest";
import type { FlightBridgeMessage } from "../../lib/aircraft/bridgeProtocol";
import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import { createDjiFlightBridgeSession } from "./session";
import {
  DjiTelemetryOnlyDriver,
  type DjiReadOnlyTelemetrySource,
} from "./telemetryOnlyDriver";

function initialSnapshot(): DjiSdkSnapshot {
  return {
    aircraftId: "m4e-readonly-1",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 0,
    headingDeg: 90,
    batteryPercent: 92,
    satellites: 22,
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
  let state = initialSnapshot();
  const listeners = new Set<(snapshot: DjiSdkSnapshot) => void>();

  const source: DjiReadOnlyTelemetrySource = {
    supportsRtk: true,
    supportsObstacleSensing: true,
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
    async connect() {},
    async disconnect() {},
    getSnapshot() { return { ...state }; },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },
  };

  return {
    source,
    publish(patch: Partial<DjiSdkSnapshot>) {
      state = { ...state, ...patch, timestampMs: state.timestampMs + 100 };
      for (const listener of listeners) listener({ ...state });
    },
  };
}

describe("DJI telemetry-only bridge stage", () => {
  it("advertises real telemetry while all flight commands remain disabled", async () => {
    const fake = makeSource();
    const driver = new DjiTelemetryOnlyDriver(fake.source);
    const { session } = createDjiFlightBridgeSession(driver, {
      bridgeId: "dji-readonly-test",
      adapterVersion: "0.2.0-readonly",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));

    await session.start();

    const hello = messages.find((message) => message.type === "hello");
    expect(hello?.type).toBe("hello");
    if (hello?.type === "hello") {
      expect(hello.vendor).toBe("dji");
      expect(hello.capabilities.telemetry).toBe(true);
      expect(hello.capabilities.rtk).toBe(true);
      expect(hello.capabilities.obstacleSensing).toBe(true);
      expect(hello.capabilities.arm).toBe(false);
      expect(hello.capabilities.takeoff).toBe(false);
      expect(hello.capabilities.goTo).toBe(false);
      expect(hello.capabilities.photoCapture).toBe(false);
      expect(hello.activePayloadId).toBe("m4e-wide");
    }

    await session.stop();
  });

  it("streams updated DJI aircraft state into DOMINIC", async () => {
    const fake = makeSource();
    const driver = new DjiTelemetryOnlyDriver(fake.source);
    const { session } = createDjiFlightBridgeSession(driver, {
      bridgeId: "dji-readonly-test",
      adapterVersion: "0.2.0-readonly",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    fake.publish({
      relativeAltitudeFt: 27.5,
      headingDeg: 143,
      batteryPercent: 87,
      rtkState: "fixed",
      obstacleAlert: true,
    });

    const telemetry = messages
      .filter((message): message is Extract<FlightBridgeMessage, { type: "telemetry" }> =>
        message.type === "telemetry",
      )
      .at(-1);

    expect(telemetry?.state.relativeAltitudeFt).toBe(27.5);
    expect(telemetry?.state.headingDeg).toBe(143);
    expect(telemetry?.state.batteryPercent).toBe(87);
    expect(telemetry?.state.rtkState).toBe("fixed");
    expect(telemetry?.state.obstacleAlert).toBe(true);

    await session.stop();
  });

  it("rejects a movement command before it can reach native DJI hardware", async () => {
    const fake = makeSource();
    const driver = new DjiTelemetryOnlyDriver(fake.source);
    const { session } = createDjiFlightBridgeSession(driver, {
      bridgeId: "dji-readonly-test",
      adapterVersion: "0.2.0-readonly",
      heartbeatIntervalMs: 60_000,
    });
    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    await session.receive({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "unsafe-takeoff",
      command: { type: "takeoff", altitudeFt: 20 },
    });

    const result = messages.find(
      (message): message is Extract<FlightBridgeMessage, { type: "command_result" }> =>
        message.type === "command_result" && message.requestId === "unsafe-takeoff",
    );

    expect(result?.result.accepted).toBe(false);
    expect(result?.result.message).toContain("does not support takeoff");

    await session.stop();
  });
});
