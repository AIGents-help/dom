import { describe, expect, it } from "vitest";
import { readinessReasons } from "./PilotReadinessBanner";

describe("readinessReasons", () => {
  it("combines API blockers and cautions", () => {
    expect(readinessReasons({
      blockers: ["Insurance is not verified"],
      cautions: ["Workflow is incomplete"],
    })).toEqual(["Insurance is not verified", "Workflow is incomplete"]);
  });

  it("treats malformed or missing reason lists as empty", () => {
    expect(readinessReasons({
      blockers: null,
      cautions: undefined,
    } as never)).toEqual([]);
  });
});
