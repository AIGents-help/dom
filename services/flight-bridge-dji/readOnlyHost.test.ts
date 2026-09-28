import { describe, expect, it } from "vitest";
import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import { createDjiReadOnlyFlightBridgeHost } from "./readOnlyHost";
import type { DjiReadOnlyTelemetrySource } from "./telemetryOnlyDriver";

class FakeSocket implements BridgeTextSocket {
  connected = true;
  sent: string[] = [];
  private textListeners = new Set<(data: string) => void>();

  sendText(data: string) { this.sent.push(data); }
  subscribeText(listener: (data: string) => void) {
    this.textListeners.add(listener);
    return () => this.textListeners.delete(listener);
  }
  async close() { this.connected = false; }
}

function snapshot(): DjiSdkSnapshot {
  return {
    aircraftId: "m4e-readonly-host",
    model: "Matrice 4E",
    connected: true,
    latitude: 39.95,
    longitude: -75.16,
    relativeAltitudeFt: 0,
    headingDeg: 180,
    batteryPercent: 95,
    satellites: 24,
    gnssQuality: "excellent",
    rtkState: "fixed",
    gimbalPitchDeg: -15,
    cameraMode: "photo",
    obstacleAlert: false,
    flightMode: "P-GPS",
    homeLatitude: 39.95,
    homeLongitude: -75.16,
    failsafe: null,
    timestampMs: 1000,
  };
}

describe("DJI read-only Flight Bridge host", () => {
  it("boots a complete DOMINIC bridge with telemetry enabled and movement disabled", async () => {
    let state = snapshot();
    const listeners = new Set<(next: DjiSdkSnapshot) => void>();
    const source: DjiReadOnlyTelemetrySource = {
      supportsRtk: true,
      supportsObstacleSensing: true,
      async connect() {},
      async disconnect() {},
      getSnapshot: () => ({ ...state }),
      subscribe(listener) {
        listeners.add(listener);
        listener({ ...state });
        return () => listeners.delete(listener);
      },
    };
    const socket = new FakeSocket();
    const host = createDjiReadOnlyFlightBridgeHost(source, socket, {
      bridgeId: "m4e-readonly-host",
      adapterVersion: "0.2.0-readonly",
      heartbeatIntervalMs: 60_000,
    });

    await host.start();

    const hello = socket.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "hello");
    expect(hello.vendor).toBe("dji");
    expect(hello.capabilities.telemetry).toBe(true);
    expect(hello.capabilities.goTo).toBe(false);
    expect(hello.capabilities.takeoff).toBe(false);

    state = { ...state, batteryPercent: 81, relativeAltitudeFt: 14, timestampMs: 1100 };
    for (const listener of listeners) listener({ ...state });

    const telemetry = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "telemetry")
      .at(-1);
    expect(telemetry.state.batteryPercent).toBe(81);
    expect(telemetry.state.relativeAltitudeFt).toBe(14);

    await host.stop();
  });
});
