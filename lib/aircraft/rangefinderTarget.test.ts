import { describe, expect, it } from "vitest";
import {
  matchRangefinderTargetToCapture,
  rangefinderTargetMatchesRegion,
  readStoredRangefinderTarget,
} from "@/lib/aircraft/rangefinderTarget";

describe("DOMINIC rangefinder anomaly localization", () => {
  it("accepts a valid target synchronized to the image capture", () => {
    const target = matchRangefinderTargetToCapture(
      {
        latitude: 39.95,
        longitude: -75.16,
        altitudeM: 22,
        distanceM: 38,
        screenX: 50,
        screenY: 50,
        updatedAtMs: 10_000,
      },
      11_000,
    );
    expect(target?.latitude).toBe(39.95);
  });

  it("rejects stale or physically invalid range readings", () => {
    expect(
      matchRangefinderTargetToCapture(
        { latitude: 39.95, longitude: -75.16, distanceM: 40, updatedAtMs: 1_000 },
        10_000,
      ),
    ).toBeNull();

    expect(
      matchRangefinderTargetToCapture(
        { latitude: 39.95, longitude: -75.16, distanceM: 2.5, updatedAtMs: 10_000 },
        10_100,
      ),
    ).toBeNull();
  });

  it("correlates the laser reticle with an AI anomaly box", () => {
    expect(
      rangefinderTargetMatchesRegion(
        { screenX: 52, screenY: 48 },
        { x: 0.4, y: 0.38, width: 0.25, height: 0.22 },
      ),
    ).toBe(true);

    expect(
      rangefinderTargetMatchesRegion(
        { screenX: 80, screenY: 80 },
        { x: 0.4, y: 0.38, width: 0.25, height: 0.22 },
      ),
    ).toBe(false);
  });

  it("reads stored rangefinder metadata safely", () => {
    expect(
      readStoredRangefinderTarget({
        rangefinderTarget: {
          latitude: 39.95,
          longitude: -75.16,
          distanceM: 31.2,
          updatedAtMs: 1234,
        },
      }),
    ).toMatchObject({ latitude: 39.95, longitude: -75.16, distanceM: 31.2 });

    expect(readStoredRangefinderTarget({ rangefinderTarget: { latitude: "bad" } })).toBeNull();
  });
});
