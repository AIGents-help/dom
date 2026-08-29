import { describe, it, expect } from "vitest";
import {
  haversineDistanceFeet, lineStringLengthFeet, polygonAreaSquareFeet,
  computeMeasurementValue, formatMeasurementValue, isValidMeasurementGeometry,
} from "./measurementPipeline";

describe("haversineDistanceFeet", () => {
  it("is zero for identical points", () => {
    expect(haversineDistanceFeet([-83.7, 41.55], [-83.7, 41.55])).toBe(0);
  });

  it("matches a known reference distance (1 degree of latitude ≈ 364,000 ft)", () => {
    const feet = haversineDistanceFeet([0, 0], [0, 1]);
    expect(feet).toBeGreaterThan(360_000);
    expect(feet).toBeLessThan(368_000);
  });

  it("matches hand-computed meters-per-degree-longitude at Toledo, OH latitude", () => {
    // At 41.5499°N, 1 degree of longitude ≈ 111,320 * cos(41.5499°) ≈
    // 83,358m ≈ 273,550ft. A 0.0013° delta ≈ 355.6ft.
    const feet = haversineDistanceFeet([-83.6982, 41.5499], [-83.6969, 41.5499]);
    expect(feet).toBeGreaterThan(350);
    expect(feet).toBeLessThan(360);
  });
});

describe("lineStringLengthFeet", () => {
  it("sums consecutive segment distances", () => {
    const a = haversineDistanceFeet([0, 0], [0, 0.001]);
    const b = haversineDistanceFeet([0, 0.001], [0.001, 0.001]);
    const total = lineStringLengthFeet([[0, 0], [0, 0.001], [0.001, 0.001]]);
    expect(total).toBeCloseTo(a + b, 5);
  });

  it("is zero for a single point", () => {
    expect(lineStringLengthFeet([[0, 0]])).toBe(0);
  });
});

describe("polygonAreaSquareFeet", () => {
  it("computes a known square's area correctly (~100ft square)", () => {
    // ~100ft square near the equator, where 1 degree ≈ 364,000ft, so
    // ~0.0002747 degrees ≈ 100ft.
    const side = 100 / 364_000;
    const square: [number, number][] = [[0, 0], [side, 0], [side, side], [0, side]];
    const area = polygonAreaSquareFeet(square);
    expect(area).toBeGreaterThan(9000);
    expect(area).toBeLessThan(11000);
  });

  it("is unaffected by winding order (always positive)", () => {
    const side = 100 / 364_000;
    const cw: [number, number][] = [[0, 0], [side, 0], [side, side], [0, side]];
    const ccw: [number, number][] = [[0, 0], [0, side], [side, side], [side, 0]];
    expect(polygonAreaSquareFeet(cw)).toBeCloseTo(polygonAreaSquareFeet(ccw), 3);
  });

  it("is zero for fewer than 3 points", () => {
    expect(polygonAreaSquareFeet([[0, 0], [1, 1]])).toBe(0);
  });

  it("handles an already-closed ring the same as an unclosed one", () => {
    const side = 100 / 364_000;
    const unclosed: [number, number][] = [[0, 0], [side, 0], [side, side], [0, side]];
    const closed: [number, number][] = [...unclosed, unclosed[0]];
    expect(polygonAreaSquareFeet(closed)).toBeCloseTo(polygonAreaSquareFeet(unclosed), 5);
  });
});

describe("computeMeasurementValue / formatMeasurementValue", () => {
  it("routes distance and area to the right calculation", () => {
    const line = { type: "LineString" as const, coordinates: [[0, 0], [0, 0.001]] as [number, number][] };
    const side = 100 / 364_000;
    const polygon = { type: "Polygon" as const, coordinates: [[0, 0], [side, 0], [side, side], [0, side]] as [number, number][] };
    expect(computeMeasurementValue("distance", line)).toBeCloseTo(lineStringLengthFeet(line.coordinates), 5);
    expect(computeMeasurementValue("area", polygon)).toBeCloseTo(polygonAreaSquareFeet(polygon.coordinates), 5);
  });

  it("uses plain Euclidean meters math for a projected (UTM-style) CRS", () => {
    // A 100m x 100m square in projected (meters) coordinates — a
    // plausible UTM easting/northing pair, not lng/lat degrees.
    const line = { type: "LineString" as const, coordinates: [[500000, 4600000], [500100, 4600000]] as [number, number][] };
    const distanceFeet = computeMeasurementValue("distance", line, "projected");
    expect(distanceFeet).toBeCloseTo(100 / 0.3048, 3); // 100m in feet

    const square = {
      type: "Polygon" as const,
      coordinates: [[500000, 4600000], [500100, 4600000], [500100, 4600100], [500000, 4600100]] as [number, number][],
    };
    const areaSqFeet = computeMeasurementValue("area", square, "projected");
    expect(areaSqFeet).toBeCloseTo(10000 / (0.3048 * 0.3048), 0); // 10,000 sq m in sq ft
  });

  it("geographic and projected formulas diverge on the same raw numbers (proves the crs flag actually branches)", () => {
    const line = { type: "LineString" as const, coordinates: [[0, 0], [0, 0.001]] as [number, number][] };
    const geographic = computeMeasurementValue("distance", line, "geographic");
    const projected = computeMeasurementValue("distance", line, "projected");
    expect(geographic).not.toBeCloseTo(projected, 0);
  });

  it("formats with the right unit and thousands separators", () => {
    expect(formatMeasurementValue("distance", 42.345)).toBe("42.3 ft");
    expect(formatMeasurementValue("area", 12345.6)).toBe("12,346 sq ft");
  });
});

describe("isValidMeasurementGeometry", () => {
  it("requires at least 2 points for a distance and 3 for an area", () => {
    expect(isValidMeasurementGeometry("distance", { type: "LineString", coordinates: [[0, 0]] })).toBe(false);
    expect(isValidMeasurementGeometry("distance", { type: "LineString", coordinates: [[0, 0], [1, 1]] })).toBe(true);
    expect(isValidMeasurementGeometry("area", { type: "Polygon", coordinates: [[0, 0], [1, 0]] })).toBe(false);
    expect(isValidMeasurementGeometry("area", { type: "Polygon", coordinates: [[0, 0], [1, 0], [1, 1]] })).toBe(true);
  });

  it("rejects a mismatched geometry type", () => {
    expect(isValidMeasurementGeometry("distance", { type: "Polygon", coordinates: [[0, 0], [1, 0], [1, 1]] })).toBe(false);
  });
});
