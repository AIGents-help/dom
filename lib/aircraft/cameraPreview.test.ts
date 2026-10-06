import { describe, expect, it } from "vitest";
import { isCameraPreviewFrame, MAX_PREVIEW_BASE64_LENGTH } from "./cameraPreview";
import { FlightBridgeAircraftAdapter } from "./bridgeAdapter";
import { LoopbackFlightBridgeTransport } from "./bridgeTransport";
import { DOMINIC_BRIDGE_PROTOCOL, parseFlightBridgeMessage } from "./bridgeProtocol";
import { simulatorCapabilities } from "./simulator";
import type { UniversalCameraPreviewFrame } from "./contract";

const frame: UniversalCameraPreviewFrame = {
  width: 960, height: 640, jpegBase64: "/9j/AA==",
  capture: { id: "preview-1", aircraftId: "preview-aircraft", capturedAtMs: 123,
    mimeType: "image/jpeg", latitude: 0, longitude: 0, relativeAltitudeFt: 0,
    headingDeg: 0, gimbalPitchDeg: 0, previewFrame: { width: 960, height: 640, telemetryAvailable: false } },
};

describe("camera preview transport boundaries", () => {
  it("rejects oversized, inconsistent, malformed, and non-finite frames before display", () => {
    expect(isCameraPreviewFrame(frame)).toBe(true);
    for (const bad of [
      { ...frame, width: 5000 },
      { ...frame, width: 100 },
      { ...frame, jpegBase64: "/9j/" + "A".repeat(MAX_PREVIEW_BASE64_LENGTH) },
      { ...frame, jpegBase64: "https://foreign.example/frame.jpg" },
      { ...frame, capture: { ...frame.capture, latitude: NaN } },
      { ...frame, capture: { ...frame.capture, cameraSource: "thermal" } },
      { ...frame, capture: { ...frame.capture, previewFrame: undefined } },
    ]) expect(isCameraPreviewFrame(bad)).toBe(false);
    expect(() => parseFlightBridgeMessage(JSON.stringify({ type: "camera_preview", protocol: DOMINIC_BRIDGE_PROTOCOL, sequence: 0, frame }))).toThrow();
  });

  it("delivers only fresh sequences from the negotiated aircraft and cleans up its subscription", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    const adapter = new FlightBridgeAircraftAdapter(transport, {
      type: "hello", protocol: DOMINIC_BRIDGE_PROTOCOL, bridgeId: "preview", adapterVersion: "1",
      vendor: "dji", aircraftId: "preview-aircraft", capabilities: { ...simulatorCapabilities, cameraPreview: true },
    });
    await adapter.connect();
    const delivered: UniversalCameraPreviewFrame[] = [];
    const unsubscribe = adapter.subscribePreview((value) => delivered.push(value));
    const emit = (sequence: number, value = frame) => transport.send({ type: "camera_preview", protocol: DOMINIC_BRIDGE_PROTOCOL, sequence, frame: value });
    await emit(2);
    await emit(1);
    await emit(2);
    await emit(3, { ...frame, capture: { ...frame.capture, aircraftId: "foreign-aircraft" } });
    await emit(4);
    expect(delivered).toHaveLength(2);
    unsubscribe();
    await emit(5);
    expect(delivered).toHaveLength(2);
    await transport.disconnect();
    expect(adapter.getState().connected).toBe(false);
    await adapter.disconnect();
  });

  it("does not accept unsolicited preview capability", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    const adapter = new FlightBridgeAircraftAdapter(transport, {
      type: "hello", protocol: DOMINIC_BRIDGE_PROTOCOL, bridgeId: "legacy", adapterVersion: "1",
      vendor: "dji", aircraftId: "preview-aircraft", capabilities: { ...simulatorCapabilities },
    });
    await adapter.connect();
    let count = 0;
    adapter.subscribePreview(() => count++);
    await transport.send({ type: "camera_preview", protocol: DOMINIC_BRIDGE_PROTOCOL, sequence: 1, frame });
    expect(count).toBe(0);
    await adapter.disconnect();
  });
});
