import { describe, expect, it } from "vitest";
import { analyzeRgbaPixels } from "@/lib/imageQuality";

function makeImage(width: number, height: number, pixel: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("DOMINIC image quality analyzer", () => {
  it("scores a detailed, mid-exposure image higher than a flat image", () => {
    const detailed = analyzeRgbaPixels(
      makeImage(64, 64, (x, y) => ((x + y) % 2 ? 50 : 205)),
    );
    const flat = analyzeRgbaPixels(makeImage(64, 64, () => 128));

    expect(detailed.sharpnessScore).toBeGreaterThan(flat.sharpnessScore);
    expect(detailed.contrastScore).toBeGreaterThan(flat.contrastScore);
  });

  it("detects heavily underexposed imagery", () => {
    const result = analyzeRgbaPixels(makeImage(64, 64, () => 3));
    expect(result.shadowClipPct).toBeGreaterThan(90);
    expect(result.exposureScore).toBeLessThan(0.5);
    expect(result.warnings.join(" ")).toContain("shadow clipping");
  });

  it("detects heavily overexposed imagery", () => {
    const result = analyzeRgbaPixels(makeImage(64, 64, () => 252));
    expect(result.highlightClipPct).toBeGreaterThan(90);
    expect(result.exposureScore).toBeLessThan(0.5);
    expect(result.warnings.join(" ")).toContain("highlight clipping");
  });

  it("rejects invalid pixel buffers", () => {
    expect(() =>
      analyzeRgbaPixels({ width: 10, height: 10, data: new Uint8ClampedArray(4) }),
    ).toThrow("invalid");
  });
});
