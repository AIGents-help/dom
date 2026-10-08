import { describe, expect, it } from "vitest";
import { MAX_AUTOMATIC_PREVIEW_FRAMES, previewScreeningBlock } from "./previewScreening";

const ready = { now: 40_000, receivedAtMs: 39_000, connected: true, canSave: true, decoded: true, busy: false, visible: true, online: true, duplicate: false, automatic: true, startedFrames: 0, lastStartedAt: 10_000, intervalSeconds: 30 };

describe("bounded preview screening", () => {
  it("allows an eligible frame only after the selected cadence", () => {
    for (const seconds of [5, 10, 30]) {
      expect(previewScreeningBlock({ ...ready, intervalSeconds: seconds, lastStartedAt: ready.now - seconds * 1000 })).toBeNull();
      expect(previewScreeningBlock({ ...ready, intervalSeconds: seconds, lastStartedAt: ready.now - seconds * 1000 + 1 })).toBe("cadence");
    }
  });
  it("never builds a backlog while the preceding job is running", () => {
    expect(previewScreeningBlock({ ...ready, busy: true, lastStartedAt: 0 })).toBe("busy");
  });
  it("pauses hidden, offline, disconnected, and unlinked work", () => {
    expect(previewScreeningBlock({ ...ready, visible: false })).toBe("hidden");
    expect(previewScreeningBlock({ ...ready, online: false })).toBe("offline");
    expect(previewScreeningBlock({ ...ready, connected: false })).toBe("disconnected");
    expect(previewScreeningBlock({ ...ready, canSave: false })).toBe("unlinked");
  });
  it("rejects absent, stale, future, and invalid receive timestamps", () => {
    for (const receivedAtMs of [null, NaN, 34_999, 40_001]) expect(previewScreeningBlock({ ...ready, receivedAtMs })).toBe("stale");
    expect(previewScreeningBlock({ ...ready, receivedAtMs: 35_000 })).toBeNull();
  });
  it("requires decoded imagery and never schedules the same frame twice", () => {
    expect(previewScreeningBlock({ ...ready, decoded: false })).toBe("undecoded");
    expect(previewScreeningBlock({ ...ready, duplicate: true })).toBe("duplicate");
  });
  it("bounds each explicitly approved automatic run", () => {
    expect(previewScreeningBlock({ ...ready, startedFrames: MAX_AUTOMATIC_PREVIEW_FRAMES - 1 })).toBeNull();
    expect(previewScreeningBlock({ ...ready, startedFrames: MAX_AUTOMATIC_PREVIEW_FRAMES })).toBe("limit");
  });
  it("invalid cadence settings fall back to 30 seconds", () => {
    for (const intervalSeconds of [0, -1, 1, NaN, Infinity]) expect(previewScreeningBlock({ ...ready, intervalSeconds, lastStartedAt: 39_000 })).toBe("cadence");
  });
  it("manual inspection skips cadence and run cap but not safety gates", () => {
    const manual = { ...ready, automatic: false, startedFrames: 30, lastStartedAt: 40_000 };
    expect(previewScreeningBlock(manual)).toBeNull();
    expect(previewScreeningBlock({ ...manual, busy: true })).toBe("busy");
    expect(previewScreeningBlock({ ...manual, duplicate: true })).toBe("duplicate");
    expect(previewScreeningBlock({ ...manual, receivedAtMs: null })).toBe("stale");
  });
});
