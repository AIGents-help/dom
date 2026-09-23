import { describe, expect, it } from "vitest";
import { FlightBridgeAircraftAdapter } from "@/lib/aircraft/bridgeAdapter";
import { DOMINIC_BRIDGE_PROTOCOL, parseFlightBridgeMessage } from "@/lib/aircraft/bridgeProtocol";
import { LoopbackFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { SimulatorAircraftAdapter, simulatorCapabilities } from "@/lib/aircraft/simulator";

describe("DOMINIC Flight Bridge", () => {
  it("validates the versioned bridge protocol", () => {
    const raw = JSON.stringify({
      type: "heartbeat",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      sentAtMs: 123,
    });
    expect(parseFlightBridgeMessage(raw).type).toBe("heartbeat");
    expect(() => parseFlightBridgeMessage('{"type":"heartbeat","protocol":"wrong"}')).toThrow();
  });

  it("carries universal commands and telemetry across a bridge transport", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    const simulator = new SimulatorAircraftAdapter({
      aircraftId: "bridge-sim-1",
      model: "Bridge Simulator",
    });

    const hello = {
      type: "hello" as const,
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      bridgeId: "bridge-1",
      vendor: "simulator" as const,
      adapterVersion: "1.0.0",
      aircraftId: "bridge-sim-1",
      model: "Bridge Simulator",
      capabilities: { ...simulatorCapabilities },
    };

    const bridgeAdapter = new FlightBridgeAircraftAdapter(transport, hello, 500);

    await transport.connect();
    transport.subscribe(async (message) => {
      if (message.type !== "command") return;
      const result = await simulator.send(message.command);
      await transport.send({
        type: "command_result",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId: message.requestId,
        result,
      });
      await transport.send({
        type: "telemetry",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        sequence: 1,
        state: simulator.getState(),
      });
    });

    await bridgeAdapter.connect();

    const result = await bridgeAdapter.send({ type: "takeoff", altitudeFt: 25 });
    expect(result.accepted).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridgeAdapter.getState().relativeAltitudeFt).toBe(25);
  });
});
