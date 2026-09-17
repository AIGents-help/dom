import { describe, expect, it } from "vitest";
import { workflowResourcesFor } from "./workflowResources";

describe("workflowResourcesFor", () => {
  it("connects capture work to the mission capture plan", () => {
    expect(workflowResourcesFor("capture_complete")).toContainEqual({
      label: "View capture plan",
      href: "#mission-capture-plan",
    });
  });

  it("connects operational requirements to supporting records", () => {
    expect(workflowResourcesFor("scope_reviewed")[0]?.href).toBe("#mission-scope");
    expect(workflowResourcesFor("authorization_active")[0]?.href).toBe("#mission-documents");
    expect(workflowResourcesFor("deliverables_uploaded")[0]?.href).toBe("#mission-deliverables");
  });

  it("returns no actions for a requirement without a connected resource", () => {
    expect(workflowResourcesFor("battery_reserves_ready")).toEqual([]);
  });
});
