import { describe, expect, it } from "vitest";
import { buildMaintenanceQueue, filterMaintenanceQueue, loadAllMaintenanceRows, maintenanceQueueStage, type MaintenanceQueueIssue } from "@/lib/dominicMaintenanceQueue";

function issue(id: string, overrides: Partial<MaintenanceQueueIssue> = {}): MaintenanceQueueIssue {
  return { id, asset_id: "tank", title: "Surface corrosion", issue_type: "corrosion", severity: "low", status: "open", first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-02T00:00:00Z", metadata: {}, ...overrides };
}
const assets = [{ id: "tank", name: "Tank 17", external_ref: "TK-017", location_label: "North terminal" }];

describe("DOMINIC cross-asset maintenance queue", () => {
  it("keeps resolved verification work active and excludes genuinely closed issues", () => {
    const rows = [
      issue("open"), issue("monitor", { status: "monitoring" }), issue("repair", { status: "in_progress" }),
      issue("required", { status: "resolved", metadata: { verificationRequired: true } }),
      issue("capturing", { status: "resolved", metadata: { verificationStatus: "in_progress" } }),
      issue("legacy", { status: "resolved", metadata: { verificationStatus: "required" } }),
      issue("closed", { status: "resolved" }), issue("verified", { status: "verified" }), issue("dismissed", { status: "dismissed" }),
    ];
    expect(buildMaintenanceQueue(rows, assets).map((entry) => entry.issue.id)).toHaveLength(6);
    expect(maintenanceQueueStage(rows[2])).toBe("maintenance");
    expect(maintenanceQueueStage(rows[3])).toBe("verification");
  });

  it("ranks a critical issue on another asset ahead of more recent routine work", () => {
    const queue = buildMaintenanceQueue([
      issue("recent"),
      issue("urgent", { asset_id: "pipe", severity: "critical", first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-09-02T00:00:00Z" }),
    ], [...assets, { id: "pipe", name: "Transfer line", external_ref: null, location_label: "Dock" }]);
    expect(queue[0].issue.id).toBe("urgent");
    expect(queue[0].asset?.name).toBe("Transfer line");
    expect(queue[0].assessment.reasons.join(" ")).toContain("Critical");
  });

  it("uses escalation score then oldest issue as deterministic tie breakers", () => {
    const rows = [issue("z"), issue("b", { first_seen_at: "2026-09-30T00:00:00Z" }), issue("a", { first_seen_at: "2026-09-30T00:00:00Z" })];
    const assessments = new Map(rows.map((row) => [row.id, { priority: "routine" as const, score: 4, reasons: [], unresolvedDays: 1 }]));
    expect(buildMaintenanceQueue(rows, assets, assessments).map((entry) => entry.issue.id)).toEqual(["a", "b", "z"]);
  });

  it("combines stage, escalation and case-insensitive asset/work-order search", () => {
    const queue = buildMaintenanceQueue([
      issue("repair", { severity: "critical", status: "in_progress", metadata: { maintenanceWorkOrder: "WO-778" } }),
      issue("verify", { status: "resolved", metadata: { verificationRequired: true } }),
    ], assets);
    expect(filterMaintenanceQueue(queue, { stage: "maintenance", priority: "escalated", search: "wo-778" }).map((entry) => entry.issue.id)).toEqual(["repair"]);
    expect(filterMaintenanceQueue(queue, { search: "tk-017" })).toHaveLength(2);
    expect(filterMaintenanceQueue(queue, { search: "NORTH TERMINAL" })).toHaveLength(2);
    expect(filterMaintenanceQueue(queue, { stage: "verification", search: "tank 17" })).toHaveLength(1);
    expect(filterMaintenanceQueue(queue, { search: "unrelated" })).toHaveLength(0);
  });

  it("retains an unresolved issue even when its asset metadata is unavailable", () => {
    const queue = buildMaintenanceQueue([issue("urgent", { asset_id: "missing" })], assets);
    expect(queue).toHaveLength(1);
    expect(queue[0].asset).toBeNull();
  });

  it("loads and escalates older urgent work beyond the first page", async () => {
    const rows = Array.from({ length: 401 }, (_, i) => issue(String(i), i === 400 ? { severity: "critical" } : {}));
    const ranges: number[][] = [];
    const loaded = await loadAllMaintenanceRows(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(ranges).toEqual([[0, 199], [200, 399], [400, 599]]);
    expect(loaded).toHaveLength(401);
    expect(buildMaintenanceQueue(loaded, assets)[0].issue.id).toBe("400");
  });

  it("rejects partial data when a later query fails instead of hiding older issues", async () => {
    await expect(loadAllMaintenanceRows(async (from) => from === 0
      ? { data: [issue("first"), issue("second")], error: null }
      : { data: null, error: { message: "Session expired" } }, 2)).rejects.toThrow("Session expired");
  });

  it("ends cleanly at a full final page and rejects missing/non-advancing pages", async () => {
    expect(await loadAllMaintenanceRows(async (from) => ({ data: from === 0 ? [issue("a"), issue("b")] : [], error: null }), 2)).toHaveLength(2);
    await expect(loadAllMaintenanceRows(async () => ({ data: null, error: null }))).rejects.toThrow("valid page");
    await expect(loadAllMaintenanceRows(async () => ({ data: [issue("a"), issue("b")], error: null }), 2)).rejects.toThrow("did not advance");
  });
});
