import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_WORKFLOW_KEYS,
  deliverablePlanFor,
  missingRequiredDeliverables,
  PROTECTED_WORKFLOW_KEYS,
  workflowProgress,
} from "./missionWorkflow";

describe("mission workflow policy", () => {
  it("defines the system-driven and protected readiness gates", () => {
    expect(AUTOMATIC_WORKFLOW_KEYS).toEqual(expect.arrayContaining([
      "uav_assigned",
      "insurance_verified",
      "capture_complete",
      "deliverables_uploaded",
      "mission_submitted",
    ]));
    expect(PROTECTED_WORKFLOW_KEYS.has("insurance_verified")).toBe(true);
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
});
