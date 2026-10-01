import { describe, expect, it } from "vitest";
import {
  nextProgressionMetadata,
  normalizeComparisonState,
  progressionEventType,
  progressionSummary,
} from "@/lib/dominicIssueProgression";

describe("DOMINIC issue progression intelligence", () => {
  it("normalizes supported comparison states", () => {
    expect(normalizeComparisonState(" WORSENING ")).toBe("worsening");
    expect(normalizeComparisonState("unknown")).toBeNull();
    expect(normalizeComparisonState(null)).toBeNull();
  });

  it("maps comparison states to specific issue-history events", () => {
    expect(progressionEventType("worsening")).toBe("observed_worsening");
    expect(progressionEventType("improving")).toBe("observed_improving");
    expect(progressionEventType("unchanged")).toBe("observed_unchanged");
    expect(progressionEventType("uncertain")).toBe("observed_uncertain");
    expect(progressionEventType("new")).toBe("observed_again");
  });

  it("builds operator-readable progression summaries", () => {
    expect(progressionSummary({ title: "Tank shell coating loss", comparisonState: "worsening" }))
      .toContain("appears worse");
    expect(progressionSummary({ title: "Tank shell coating loss", comparisonState: "improving" }))
      .toContain("appears improved");
  });

  it("keeps durable counts for repeated longitudinal comparison signals", () => {
    expect(
      nextProgressionMetadata(
        { worseningCount: 2, improvingCount: 1 },
        "worsening",
      ),
    ).toMatchObject({
      worseningCount: 3,
      improvingCount: 1,
    });
  });
});
