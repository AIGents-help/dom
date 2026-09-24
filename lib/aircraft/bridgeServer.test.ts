import { describe, expect, it } from "vitest";
import { FlightBridgeServerSession } from "@/lib/aircraft/bridgeServer";
import { DOMINIC_BRIDGE_PROTOCOL, type FlightBridgeMessage } from "@/lib/aircraft/bridgeProtocol";
import { SimulatorAircraftAdapter } from "@/lib/aircraft/simulator";

describe("DOMINIC Flight Bridge server session", () => {
  it("announces aircraft capabilities and streams normalized telemetry", async () => {
    const aircraft = new SimulatorAircraftAdapter({ aircraftId: "sim-bridge" });
    const session = new FlightBridgeServerSession(aircraft, {
      bridgeId: "bridge-local",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 10_000,
    });

    const messages: FlightBridgeMessage[] = [];
    const unsubscribe = session.subscribe((message) => messages.push(message));

    await session.start();

    expect(messages.some((message) => message.type === "hello")).toBe(true);
    expect(messages.some((message) => message.type === "telemetry")).toBe(true);

    await session.stop();
    unsubscribe();
  });

  it("executes universal commands and returns command results", async () => {
    const aircraft = new SimulatorAircraftAdapter();
    const session = new FlightBridgeServerSession(aircraft, {
      bridgeId: "bridge-local",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 10_000,
    });

    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    await session.receive({
      type: "command",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      requestId: "req-1",
      command: { type: "takeoff", altitudeFt: 25 },
    });

    expect(
      messages.some(
        (message) =>
          message.type === "command_result" &&
          message.requestId === "req-1" &&
          message.result.accepted,
      ),
    ).toBe(true);
    expect(aircraft.getState().relativeAltitudeFt).toBe(25);

    await session.stop();
  });
  it("correlates aircraft photos with capture-plan checkpoints", async () => {
    const aircraft = new SimulatorAircraftAdapter({ aircraftId: "sim-media" });
    const session = new FlightBridgeServerSession(aircraft, {
      bridgeId: "bridge-local",
      adapterVersion: "1.0.0",
      heartbeatIntervalMs: 10_000,
    });

    const messages: FlightBridgeMessage[] = [];
    session.subscribe((message) => messages.push(message));
    await session.start();

    await session.receive({
      type: "command",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      requestId: "capture-1",
      command: { type: "capturePhoto", checkpointId: "high-7" },
    });

    const media = messages.find((message) => message.type === "media_capture");
    expect(media).toBeTruthy();
    expect(media.capture.checkpointId).toBe("high-7");
    expect(media.capture.aircraftId).toBe("sim-media");

    await session.stop();
  });
});
