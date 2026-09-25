import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_WORKFLOW_KEYS,
  deliverablePlanFor,
  missionCompletionMode,
  missingRequiredDeliverables,
  PROTECTED_WORKFLOW_KEYS,
  workflowProgress,
} from "./missionWorkflow";

describe("mission workflow policy", () => {
  it("defines the system-driven and protected readiness gates", () => {
    expect(AUTOMATIC_WORKFLOW_KEYS).toEqual(expect.arrayContaining([
      "uav_assigned",
      "insurance_verified",
      "schedule_confirmed",
      "capture_complete",
      "deliverables_uploaded",
      "mission_submitted",
    ]));
    for (const key of AUTOMATIC_WORKFLOW_KEYS) expect(PROTECTED_WORKFLOW_KEYS.has(key)).toBe(true);
    expect(PROTECTED_WORKFLOW_KEYS.has("scope_reviewed")).toBe(false);
  });

  it("requires both the inspection photos and report for a commercial roof mission", () => {
    const plan = deliverablePlanFor("roof_inspection_commercial");
    expect(plan.filter((item) => item.required).map((item) => item.type)).toEqual(["raw_images", "report"]);
    expect(missingRequiredDeliverables("roof_inspection_commercial", ["raw_images"]).map((item) => item.type)).toEqual(["report"]);
    expect(missingRequiredDeliverables("roof_inspection_commercial", ["raw_images", "report"])).toEqual([]);
  });

  it("uses one approved-scope output for a custom mission", () => {
    expect(missingRequiredDeliverables("custom", [])).toHaveLength(1);
    expect(missingRequiredDeliverables("custom", ["video"])).toEqual([]);
  });

  it("reports prerequisites separately from the final submission action", () => {
    expect(workflowProgress([
      { item_key: "scope_reviewed", completed: true },
      { item_key: "media_backed_up", completed: false },
      { item_key: "mission_submitted", completed: false },
    ])).toEqual({ prerequisitesCompleted: 1, prerequisitesTotal: 2, submitted: false });
  });

  it("separates DOM QC, owner delivery, and team-pilot review", () => {
    expect(missionCompletionMode(null, "pilot-1", "admin")).toBe("dom_qc");
    expect(missionCompletionMode("pilot-1", "pilot-1", "pilot")).toBe("owner_delivery");
    expect(missionCompletionMode("owner-1", "pilot-2", "pilot")).toBe("owner_review");
  });
});
