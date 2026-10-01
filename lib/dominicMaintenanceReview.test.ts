import { describe, expect, it } from "vitest";
import {
  deriveMaintenanceReviewPriority,
  maintenanceReviewPriorityLabel,
  maintenanceReviewPriorityRank,
} from "@/lib/dominicMaintenanceReview";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("DOMINIC maintenance review escalation", () => {
  it("escalates a high-severity issue with visible worsening to attention now", () => {
    const assessment = deriveMaintenanceReviewPriority(
      {
        severity: "high",
        status: "open",
        firstSeenAt: "2026-09-20T12:00:00Z",
        metadata: {
          latestComparisonState: "worsening",
          recurrenceCount: 1,
          worseningCount: 1,
        },
      },
      NOW,
    );

    expect(assessment.priority).toBe("attention_now");
    expect(assessment.score).toBeGreaterThanOrEqual(10);
    expect(assessment.reasons.join(" ")).toContain("worsening");
  });

  it("keeps a first low-severity observation in monitor", () => {
    const assessment = deriveMaintenanceReviewPriority(
      {
        severity: "low",
        status: "open",
        firstSeenAt: "2026-09-30T12:00:00Z",
        metadata: { recurrenceCount: 0 },
      },
      NOW,
    );

    expect(assessment.priority).toBe("monitor");
  });

  it("raises recurring medium issues even without worsening evidence", () => {
    const assessment = deriveMaintenanceReviewPriority(
      {
        severity: "medium",
        status: "monitoring",
        firstSeenAt: "2026-08-01T12:00:00Z",
        metadata: {
          latestComparisonState: "unchanged",
          recurrenceCount: 3,
        },
      },
      NOW,
    );

    expect(["elevated", "attention_now"]).toContain(assessment.priority);
    expect(assessment.reasons.join(" ")).toContain("recurred 3 times");
  });

  it("does not treat visible improvement as worsening", () => {
    const assessment = deriveMaintenanceReviewPriority(
      {
        severity: "medium",
        status: "open",
        firstSeenAt: "2026-09-25T12:00:00Z",
        metadata: {
          latestComparisonState: "improving",
          recurrenceCount: 1,
        },
      },
      NOW,
    );

    expect(assessment.priority).toBe("routine");
    expect(assessment.reasons.join(" ")).toContain("improvement");
  });

  it("provides stable priority labels and ranking", () => {
    expect(maintenanceReviewPriorityLabel("attention_now")).toBe("Attention now");
    expect(maintenanceReviewPriorityRank("attention_now"))
      .toBeGreaterThan(maintenanceReviewPriorityRank("elevated"));
    expect(maintenanceReviewPriorityRank("elevated"))
      .toBeGreaterThan(maintenanceReviewPriorityRank("routine"));
  });
});
