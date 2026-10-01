import { describe, expect, it } from "vitest";
import { deriveIssueTrackingKey, severityRank } from "@/lib/dominicIssueTracking";

describe("DOMINIC issue tracking", () => {
  it("uses a detector tracking key when available", () => {
    expect(
      deriveIssueTrackingKey({
        findingType: "corrosion_like",
        title: "Orange discoloration",
        detector: { trackingKey: "Tank Shell Northeast Stain" },
      }),
    ).toBe("tank_shell_northeast_stain");
  });

  it("uses laser-localized target coordinates before image position", () => {
    const key = deriveIssueTrackingKey({
      findingType: "coating_damage",
      title: "Coating loss",
      spatialAnchor: {
        targetLocation: {
          latitude: 39.8512342,
          longitude: -75.4512389,
          source: "laser_rangefinder",
        },
        imageRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
      detector: { trackingKey: "northeast_shell_coating" },
    });

    expect(key).toBe(
      "coating_damage:geo_39_85123_m75_45124:northeast_shell_coating",
    );
  });

  it("keeps small coordinate jitter on the same meter-scale issue key", () => {
    const first = deriveIssueTrackingKey({
      findingType: "staining_or_residue",
      title: "Vertical stain",
      spatialAnchor: {
        targetLocation: { latitude: 39.8512342, longitude: -75.4512389 },
      },
    });
    const repeat = deriveIssueTrackingKey({
      findingType: "staining_or_residue",
      title: "Dark vertical streak",
      spatialAnchor: {
        targetLocation: { latitude: 39.8512344, longitude: -75.4512391 },
      },
    });

    expect(repeat).toBe(first);
  });

  it("falls back to finding type, image region bucket and title", () => {
    const key = deriveIssueTrackingKey({
      findingType: "coating_damage",
      title: "Coating loss near upper seam",
      spatialAnchor: {
        imageRegion: { x: 0.7, y: 0.05, width: 0.1, height: 0.1 },
      },
    });

    expect(key).toBe("coating_damage:r1c3:coating_loss_near_upper_seam");
  });

  it("keeps severity ordering monotonic", () => {
    expect(severityRank("high")).toBeGreaterThan(severityRank("medium"));
    expect(severityRank("critical")).toBeGreaterThan(severityRank("high"));
    expect(severityRank("unknown")).toBe(0);
  });
});
