import { describe, expect, it } from "vitest";
import { FlightBridgeWireHost, type BridgeTextSocket } from "@/lib/aircraft/bridgeWireHost";
import { FlightBridgeServerSession } from "@/lib/aircraft/bridgeServer";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";

class FakeSocket implements BridgeTextSocket {
  connected = true;
  sent: string[] = [];
  private textListeners = new Set<(data: string) => void>();
  private closeListeners = new Set<() => void>();

  sendText(data: string) {
    this.sent.push(data);
  }

  subscribeText(listener: (data: string) => void) {
    this.textListeners.add(listener);
    return () => this.textListeners.delete(listener);
  }

  subscribeClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async close() {
    this.connected = false;
    for (const listener of this.closeListeners) listener();
  }

  receive(data: string) {
    for (const listener of this.textListeners) listener(data);
  }
}

describe("FlightBridgeWireHost", () => {
  it("serializes hello/telemetry and routes inbound commands", async () => {
    const socket = new FakeSocket();
    const aircraft = new SimulatorAircraftAdapter({ aircraftId: "wire-sim" });
    const session = new FlightBridgeServerSession(aircraft, {
      bridgeId: "wire-host",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 60_000,
    });
    const host = new FlightBridgeWireHost(session, socket);

    await host.start();

    expect(socket.sent.some((raw) => JSON.parse(raw).type === "hello")).toBe(true);
    expect(socket.sent.some((raw) => JSON.parse(raw).type === "telemetry")).toBe(true);

    socket.receive(JSON.stringify({
      type: "command",
      protocol: "dominic.flight-bridge.v1",
      requestId: "takeoff-1",
      command: { type: "takeoff", altitudeFt: 25 },
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(aircraft.getState().relativeAltitudeFt).toBe(25);
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .some((message) => message.type === "command_result" && message.requestId === "takeoff-1" && message.result.accepted),
    ).toBe(true);

    await host.stop();
  });

  it("returns a protocol error for malformed traffic instead of crashing", async () => {
    const socket = new FakeSocket();
    const session = new FlightBridgeServerSession(new SimulatorAircraftAdapter(), {
      bridgeId: "wire-host",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 60_000,
    });
    const host = new FlightBridgeWireHost(session, socket);
    await host.start();

    socket.receive("{bad json");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errors = socket.sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === "error");
    expect(errors.some((message) => message.code === "invalid_message")).toBe(true);

    await host.stop();
  });

  it("stops the aircraft session when the native socket closes", async () => {
    const socket = new FakeSocket();
    const aircraft = new SimulatorAircraftAdapter();
    const session = new FlightBridgeServerSession(aircraft, {
      bridgeId: "wire-host",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 60_000,
    });
    const host = new FlightBridgeWireHost(session, socket);
    await host.start();

    await socket.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(aircraft.getState().connected).toBe(false);
  });
});
