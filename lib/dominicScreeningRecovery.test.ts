import { describe, expect, it } from "vitest";
import { screeningRecoveryState, type ScreeningJob } from "./dominicScreeningRecovery";

const job: ScreeningJob = { media_id: "image", status: "processing", lease_expires_at: "2026-10-08T08:00:00Z", attempt_count: 2, last_error: null };
describe("screening recovery", () => {
  it("blocks active work and permits a manual retry at the lease boundary", () => {
    expect(screeningRecoveryState(job, Date.parse(job.lease_expires_at) - 1).active).toBe(true);
    expect(screeningRecoveryState(job, Date.parse(job.lease_expires_at))).toMatchObject({ active: false, label: "Retry interrupted screening" });
  });
  it("does not strand work with an invalid lease", () => {
    expect(screeningRecoveryState({ ...job, lease_expires_at: "invalid" }, 0).active).toBe(false);
  });
  it("keeps completed work completed regardless of lease expiry", () => {
    expect(screeningRecoveryState({ ...job, status: "succeeded" }, Infinity).completed).toBe(true);
  });
  it("shows provider failure without enabling automatic retry", () => {
    expect(screeningRecoveryState({ ...job, status: "failed", last_error: "Service unavailable" }, 0)).toMatchObject({ active: false, note: "Service unavailable", label: "Retry screening" });
  });
});
