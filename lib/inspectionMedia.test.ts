import { describe, expect, it } from "vitest";
import {
  bridgeCaptureMetadata,
  buildInspectionMediaStoragePath,
  inspectionSensorMode,
  sanitizeInspectionStorageSegment,
} from "@/lib/inspectionMedia";

describe("DOMINIC inspection media helpers", () => {
  it("maps connected payloads to inspection sensor modes", () => {
    expect(inspectionSensorMode({ kind: "rgb" })).toBe("rgb");
    expect(inspectionSensorMode({ kind: "zoom" })).toBe("zoom");
    expect(inspectionSensorMode({ kind: "thermal" })).toBe("thermal");
    expect(inspectionSensorMode({ kind: "multispectral" })).toBe("multispectral");
    expect(inspectionSensorMode({ kind: "lidar" })).toBe("lidar");
    expect(inspectionSensorMode(null)).toBe("rgb");
  });

  it("builds a private user-scoped deterministic bridge path", () => {
    expect(
      buildInspectionMediaStoragePath({
        userId: "user-123",
        inspectionId: "inspection-456",
        captureId: "capture 1",
        filename: "DJI 0001.JPG",
      }),
    ).toBe(
      "user-123/dominic-inspections/inspection-456/bridge-capture-1-DJI-0001.JPG",
    );
  });

  it("sanitizes unsafe storage segments", () => {
    expect(sanitizeInspectionStorageSegment("../../ weird / name .jpg")).toBe(
      "..-..-weird-name-.jpg",
    );
  });

  it("preserves flight evidence metadata", () => {
    const metadata = bridgeCaptureMetadata({
      capture: {
        id: "capture-1",
        aircraftId: "aircraft-1",
        checkpointId: "cp-7",
        capturedAtMs: 123,
        mimeType: "image/jpeg",
        latitude: 39.9,
        longitude: -75.2,
        relativeAltitudeFt: 82,
        headingDeg: 123,
        gimbalPitchDeg: -35,
        gimbalYawDeg: 5,
      },
      bridge: {
        bridgeId: "bridge-1",
        vendor: "dji",
        model: "Matrice 4E",
      },
      payload: {
        id: "wide",
        name: "Wide Camera",
        kind: "rgb",
      },
    });

    expect(metadata).toMatchObject({
      source: "flight_bridge",
      captureId: "capture-1",
      aircraftId: "aircraft-1",
      checkpointId: "cp-7",
      headingDeg: 123,
      gimbalPitchDeg: -35,
      gimbalYawDeg: 5,
      bridgeId: "bridge-1",
      vendor: "dji",
      model: "Matrice 4E",
      payload: {
        id: "wide",
        kind: "rgb",
      },
    });
  });
});
