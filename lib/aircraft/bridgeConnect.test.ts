import { describe, expect, it } from "vitest";
import { waitForBridgeHello } from "@/lib/aircraft/bridgeConnect";
import { DOMINIC_BRIDGE_PROTOCOL } from "@/lib/aircraft/bridgeProtocol";
import { LoopbackFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { simulatorCapabilities } from "@/lib/aircraft/simulator";

describe("DOMINIC Flight Bridge connection handshake", () => {
  it("discovers vendor and capabilities from bridge hello", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    const helloPromise = waitForBridgeHello(transport, 500);

    await transport.connect();
    await transport.send({
      type: "hello",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      bridgeId: "field-bridge-1",
      vendor: "mavlink",
      adapterVersion: "1.0.0",
      aircraftId: "vehicle-7",
      model: "PX4 Test Vehicle",
      capabilities: { ...simulatorCapabilities, rtk: false },
    });

    const hello = await helloPromise;
    expect(hello.vendor).toBe("mavlink");
    expect(hello.aircraftId).toBe("vehicle-7");
    expect(hello.capabilities.rtk).toBe(false);
  });

  it("times out cleanly when no bridge identifies itself", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    await transport.connect();
    await expect(waitForBridgeHello(transport, 10)).rejects.toThrow("did not send hello");
  });
});
