import { describe, expect, it } from "vitest";
import {
  MemoryMissionRecoveryStore,
  canResumeMission,
  createRecoveryRecord,
  missionPlanHash,
} from "@/lib/aircraft/missionRecovery";
import type { MissionExecutionSnapshot } from "@/lib/aircraft/missionEngine";

const snapshot: MissionExecutionSnapshot = {
  phase: "TRANSIT",
  checkpointIndex: 3,
  checkpointCount: 10,
  completedCheckpointIds: ["p1", "p2", "p3"],
  currentCheckpointId: "p4",
  events: [],
};

describe("DOMINIC mission recovery", () => {
  it("stores and reloads a mission recovery record", async () => {
    const store = new MemoryMissionRecoveryStore();
    const hash = missionPlanHash({
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      checkpointIds: ["p1", "p2", "p3", "p4"],
    });
    const record = createRecoveryRecord({
      missionKey: "object-scan-1",
      missionHash: hash,
      snapshot,
      savedAtMs: 1000,
    });

    await store.save(record);
    const loaded = await store.load("object-scan-1");

    expect(loaded?.savedAtMs).toBe(1000);
    expect(loaded?.snapshot.completedCheckpointIds).toEqual(["p1", "p2", "p3"]);
    expect(canResumeMission({ record: loaded, expectedMissionHash: hash }).resumable).toBe(true);
  });

  it("rejects recovery state from a different capture plan", () => {
    const record = createRecoveryRecord({
      missionKey: "object-scan-1",
      missionHash: "old-plan",
      snapshot,
    });
    expect(
      canResumeMission({ record, expectedMissionHash: "new-plan" }).resumable,
    ).toBe(false);
  });

  it("does not resume completed missions", () => {
    const record = createRecoveryRecord({
      missionKey: "done",
      missionHash: "same",
      snapshot: { ...snapshot, phase: "COMPLETE" },
    });
    expect(
      canResumeMission({ record, expectedMissionHash: "same" }).resumable,
    ).toBe(false);
  });
});
