import { describe, expect, it } from "vitest";
import {
  findingPrimaryMediaId,
  maintenanceEvidenceRole,
  selectMaintenancePackageMedia,
} from "@/lib/dominicMaintenancePackage";

describe("DOMINIC maintenance issue package evidence", () => {
  it("recovers the wide context frame when the confirmed finding points at detail media", () => {
    const finding = {
      inspection_id: "inspection-1",
      spatial_anchor: {},
      detector: { mediaId: "detail-1" },
    };
    const media = [
      {
        id: "context-1",
        inspection_id: "inspection-1",
        storage_path: "context.jpg",
        captured_at: "2026-10-01T12:00:00Z",
        metadata: {
          evidenceRole: "context",
          evidenceSequenceId: "followup-issue-1",
        },
      },
      {
        id: "detail-1",
        inspection_id: "inspection-1",
        storage_path: "detail.jpg",
        captured_at: "2026-10-01T12:00:02Z",
        metadata: {
          evidenceRole: "detail",
          evidenceSequenceId: "followup-issue-1",
        },
      },
      {
        id: "unrelated",
        inspection_id: "inspection-1",
        storage_path: "other.jpg",
        captured_at: "2026-10-01T12:01:00Z",
        metadata: {},
      },
    ];

    const selected = selectMaintenancePackageMedia(finding, media);

    expect(selected.map((item) => item.id)).toEqual(["context-1", "detail-1"]);
    expect(selected.map((item) => maintenanceEvidenceRole(item.metadata))).toEqual([
      "context",
      "detail",
    ]);
  });

  it("uses explicit finding evidence when no pair sequence exists", () => {
    const finding = {
      inspection_id: "inspection-2",
      spatial_anchor: { mediaId: "primary" },
      detector: {},
    };
    const media = [
      {
        id: "primary",
        inspection_id: "inspection-2",
        storage_path: "primary.jpg",
        captured_at: "2026-10-01T13:00:00Z",
        metadata: {},
      },
      {
        id: "operator-extra",
        inspection_id: "inspection-2",
        storage_path: "extra.jpg",
        captured_at: "2026-10-01T13:01:00Z",
        metadata: {},
      },
    ];

    const selected = selectMaintenancePackageMedia(finding, media, [
      { source_id: "operator-extra", storage_path: "extra.jpg" },
    ]);

    expect(selected.map((item) => item.id)).toEqual(["primary", "operator-extra"]);
  });

  it("prefers detector media identity over the spatial anchor media identity", () => {
    expect(
      findingPrimaryMediaId({
        inspection_id: "inspection-3",
        spatial_anchor: { mediaId: "anchor" },
        detector: { mediaId: "detector" },
      }),
    ).toBe("detector");
  });
});
