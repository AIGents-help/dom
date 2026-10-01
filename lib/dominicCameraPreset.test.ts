import { describe, expect, it } from "vitest";
import { buildDominicInspectionCameraPreset } from "@/lib/dominicCameraPreset";

describe("DOMINIC inspection camera presets", () => {
  it("keeps close security evidence wide when detail zoom is unnecessary", () => {
    const preset = buildDominicInspectionCameraPreset({
      inspectionType: "security",
      targetDistanceM: 8,
      recommendedZoom: 1.2,
      hasFocusTarget: false,
    });
    expect(preset.cameraSource).toBe("wide");
    expect(preset.zoomRatio).toBe(1);
  });

  it("uses the zoom camera and stronger framing for a far visual anomaly", () => {
    const preset = buildDominicInspectionCameraPreset({
      inspectionType: "visual",
      targetDistanceM: 48,
      recommendedZoom: 1.8,
      hasFocusTarget: true,
    });
    expect(preset.cameraSource).toBe("zoom");
    expect(preset.zoomRatio).toBeGreaterThanOrEqual(3);
    expect(preset.focusStrategy).toBe("anomaly");
  });

  it("caps LDAR RGB context framing to avoid over-zooming", () => {
    const preset = buildDominicInspectionCameraPreset({
      inspectionType: "ldar",
      targetDistanceM: 75,
      recommendedZoom: 7,
      hasFocusTarget: true,
    });
    expect(preset.zoomRatio).toBe(4);
    expect(preset.cameraSource).toBe("zoom");
  });
});
