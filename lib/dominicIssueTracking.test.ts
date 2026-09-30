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
