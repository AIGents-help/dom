import { describe, expect, it } from "vitest";
import { inspectionCopilotActions } from "./dominicInspectionCopilot";
const image = { id: "image", media_type: "image", storage_path: "private/image.jpg", sensor_mode: "rgb", mime_type: "image/jpeg", original_filename: "tank.jpg", analysis_status: "pending" };
const finding = { id: "finding", title: "Coating candidate", severity: "medium", review_status: "needs_review", detector: { mediaId: "image" }, spatial_anchor: {} };
describe("Inspection Copilot evidence priorities", () => {
  it("puts critical operator review before image screening without promoting candidates", () => {
    const actions = inspectionCopilotActions([image], [finding, { ...finding, id: "critical", severity: "critical" }]);
    expect(actions.map((action) => action.id)).toEqual(["review:critical", "review:finding", "screen:image"]);
    expect(actions[0].reason).toContain("operator review required");
    expect(finding.review_status).toBe("needs_review");
  });
  it("excludes confirmed and dismissed findings from the review queue", () => {
    expect(inspectionCopilotActions([], ["confirmed", "dismissed"].map((review_status) => ({ ...finding, review_status })))).toEqual([]);
  });
  it("retries failed visual evidence and leaves analyzing and completed evidence alone", () => {
    expect(inspectionCopilotActions(["failed", "analyzing", "review", "complete"].map((analysis_status) => ({ ...image, id: analysis_status, analysis_status })), []).map((a) => a.kind)).toEqual(["retry"]);
  });
  it("does not send thermal, unsupported or missing files to visual screening", () => {
    expect(inspectionCopilotActions([{ ...image, sensor_mode: "thermal" }, { ...image, media_type: "video" }, { ...image, mime_type: "image/tiff" }, { ...image, storage_path: null }], [])).toEqual([]);
  });
  it("identifies missing source evidence and accepts a spatial-anchor source", () => {
    expect(inspectionCopilotActions([], [finding])[0]).toMatchObject({ mediaId: undefined });
    expect(inspectionCopilotActions([], [finding])[0].reason).toContain("No linked source image");
    expect(inspectionCopilotActions([image], [{ ...finding, detector: {}, spatial_anchor: { mediaId: "image" } }])[0].mediaId).toBe("image");
  });
});
