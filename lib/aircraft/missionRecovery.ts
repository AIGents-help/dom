import type { MissionExecutionSnapshot } from "@/lib/aircraft/missionEngine";

export type MissionRecoveryRecord = {
  schema: "dominic.mission-recovery.v1";
  missionKey: string;
  savedAtMs: number;
  snapshot: MissionExecutionSnapshot;
  missionHash: string;
};

export interface MissionRecoveryStore {
  save(record: MissionRecoveryRecord): Promise<void>;
  load(missionKey: string): Promise<MissionRecoveryRecord | null>;
  remove(missionKey: string): Promise<void>;
}

export class MemoryMissionRecoveryStore implements MissionRecoveryStore {
  private records = new Map<string, MissionRecoveryRecord>();

  async save(record: MissionRecoveryRecord) {
    this.records.set(record.missionKey, structuredClone(record));
  }

  async load(missionKey: string) {
    const value = this.records.get(missionKey);
    return value ? structuredClone(value) : null;
  }

  async remove(missionKey: string) {
    this.records.delete(missionKey);
  }
}

export class BrowserMissionRecoveryStore implements MissionRecoveryStore {
  constructor(private readonly prefix = "dominic:mission-recovery:") {}

  async save(record: MissionRecoveryRecord) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      this.prefix + record.missionKey,
      JSON.stringify(record),
    );
  }

  async load(missionKey: string) {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(this.prefix + missionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MissionRecoveryRecord;
      if (parsed?.schema !== "dominic.mission-recovery.v1") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async remove(missionKey: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(this.prefix + missionKey);
  }
}

export function missionPlanHash(input: {
  centerLatitude: number;
  centerLongitude: number;
  checkpointIds: string[];
}) {
  const raw = [
    input.centerLatitude.toFixed(7),
    input.centerLongitude.toFixed(7),
    ...input.checkpointIds,
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createRecoveryRecord(input: {
  missionKey: string;
  missionHash: string;
  snapshot: MissionExecutionSnapshot;
  savedAtMs?: number;
}): MissionRecoveryRecord {
  return {
    schema: "dominic.mission-recovery.v1",
    missionKey: input.missionKey,
    missionHash: input.missionHash,
    savedAtMs: input.savedAtMs ?? Date.now(),
    snapshot: structuredClone(input.snapshot),
  };
}

export function canResumeMission(input: {
  record: MissionRecoveryRecord | null;
  expectedMissionHash: string;
}) {
  if (!input.record) return { resumable: false, reason: "No saved mission state." };
  if (input.record.missionHash !== input.expectedMissionHash) {
    return {
      resumable: false,
      reason: "Saved mission does not match the current capture plan.",
    };
  }
  if (["COMPLETE", "ABORTED", "FAILED"].includes(input.record.snapshot.phase)) {
    return {
      resumable: false,
      reason: `Saved mission is already ${input.record.snapshot.phase.toLowerCase()}.`,
    };
  }
  return {
    resumable: true,
    reason: "Mission recovery state matches the current plan.",
  };
}
