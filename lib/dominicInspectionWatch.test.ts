import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSPECTION_WATCH_INTERVAL_SEC,
  inspectionWatchReadiness,
  normalizeInspectionWatchInterval,
} from "@/lib/dominicInspectionWatch";

describe("DOMINIC Inspection Watch", () => {
  it("clamps watch cadence to a safe still-capture range", () => {
    expect(normalizeInspectionWatchInterval(2)).toBe(10);
    expect(normalizeInspectionWatchInterval(15.4)).toBe(15);
    expect(normalizeInspectionWatchInterval(300)).toBe(120);
    expect(normalizeInspectionWatchInterval(Number.NaN)).toBe(
      DEFAULT_INSPECTION_WATCH_INTERVAL_SEC,
    );
  });

  it("requires a real inspection, compatible equipment, bridge and photo capture", () => {
    expect(
      inspectionWatchReadiness({
        enabled: true,
        hasInspectionContext: true,
        equipmentReady: true,
        bridgeConnected: true,
        photoCaptureSupported: true,
        capturePending: false,
      }),
    ).toEqual({ ready: true, reason: "ready" });

    expect(
      inspectionWatchReadiness({
        enabled: true,
        hasInspectionContext: true,
        equipmentReady: true,
        bridgeConnected: false,
        photoCaptureSupported: true,
        capturePending: false,
      }).reason,
    ).toBe("bridge_disconnected");
  });

  it("does not overlap aircraft still captures", () => {
    expect(
      inspectionWatchReadiness({
        enabled: true,
        hasInspectionContext: true,
        equipmentReady: true,
        bridgeConnected: true,
        photoCaptureSupported: true,
        capturePending: true,
      }).reason,
    ).toBe("capture_pending");
  });
});
