import { describe, expect, it } from "vitest";
import {
  describeRadiometricCapture,
  normalizeRadiometricCapture,
} from "@/lib/dominicThermal";

describe("DOMINIC radiometric thermal evidence", () => {
  it("normalizes valid measured thermal metadata", () => {
    const result = normalizeRadiometricCapture({
      radiometric: true,
      minTempC: 22.4,
      maxTempC: 61.8,
      meanTempC: 31.2,
      centerTempC: 34.1,
      hotspot: { x: 0.65, y: 0.42, tempC: 61.8 },
      emissivity: 0.95,
    });
    expect(result?.radiometric).toBe(true);
    expect(result?.maxTempC).toBe(61.8);
    expect(result?.hotspot?.x).toBe(0.65);
  });

  it("rejects palette-only or incomplete metadata as radiometric", () => {
    expect(normalizeRadiometricCapture({ palette: "ironbow" })).toBeNull();
    expect(
      normalizeRadiometricCapture({
        radiometric: true,
        minTempC: 20,
        maxTempC: 40,
      }),
    ).toBeNull();
  });

  it("explicitly prevents exact temperature claims without measurements", () => {
    expect(describeRadiometricCapture(null)).toContain("do not claim exact temperatures");
  });
});
