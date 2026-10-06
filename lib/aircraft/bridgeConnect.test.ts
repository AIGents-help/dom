import { describe, expect, it } from "vitest";
import { connectFlightBridgeAdapter, waitForBridgeHello } from "@/lib/aircraft/bridgeConnect";
import { DOMINIC_BRIDGE_PROTOCOL } from "@/lib/aircraft/bridgeProtocol";
import { LoopbackFlightBridgeTransport, WebSocketFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { simulatorCapabilities } from "@/lib/aircraft/simulator";

describe("DOMINIC Flight Bridge connection handshake", () => {
  it("receives an immediate hello emitted in the same turn as socket open", async () => {
    class ImmediateHelloSocket extends EventTarget {
      readyState = 0;
      send() {}
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    }
    const socket = new ImmediateHelloSocket();
    const transport = new WebSocketFlightBridgeTransport("ws://127.0.0.1:8787", () => {
      queueMicrotask(() => {
        socket.readyState = 1;
        socket.dispatchEvent(new Event("open"));
        socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({
          type: "hello", protocol: DOMINIC_BRIDGE_PROTOCOL, bridgeId: "immediate",
          vendor: "dji", adapterVersion: "1", aircraftId: "camera-aircraft",
          capabilities: { ...simulatorCapabilities, cameraPreview: true },
        }) }));
      });
      return socket;
    });
    const { adapter, hello } = await connectFlightBridgeAdapter(transport, 100);
    expect(hello.capabilities.cameraPreview).toBe(true);
    expect(adapter.getState().connected).toBe(true);
    await adapter.disconnect();
    expect(transport.connected).toBe(false);
  });

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
