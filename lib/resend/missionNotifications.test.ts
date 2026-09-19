import { describe, expect, it } from "vitest";
import { shouldSendDeliverableReminder, shouldSendMissionReminder } from "./missionNotifications";

const NOW = new Date("2026-09-19T13:00:00.000Z");

describe("mission notification timing", () => {
  it("selects accepted or scheduled missions inside the next-day window", () => {
    expect(shouldSendMissionReminder("2026-09-20T17:00:00.000Z", "scheduled", NOW)).toBe(true);
    expect(shouldSendMissionReminder("2026-09-20T17:00:00.000Z", "accepted", NOW)).toBe(true);
    expect(shouldSendMissionReminder("2026-09-21T13:01:00.000Z", "scheduled", NOW)).toBe(false);
    expect(shouldSendMissionReminder("2026-09-19T12:59:00.000Z", "scheduled", NOW)).toBe(false);
    expect(shouldSendMissionReminder("2026-09-20T13:00:00.000Z", "submitted", NOW)).toBe(false);
  });

  it("waits twelve hours after field completion and stops after submission", () => {
    expect(shouldSendDeliverableReminder("2026-09-19T01:00:00.000Z", null, "scheduled", NOW)).toBe(true);
    expect(shouldSendDeliverableReminder("2026-09-19T01:01:00.000Z", null, "scheduled", NOW)).toBe(false);
    expect(shouldSendDeliverableReminder("2026-09-18T13:00:00.000Z", "2026-09-19T02:00:00.000Z", "submitted", NOW)).toBe(false);
    expect(shouldSendDeliverableReminder("2026-09-18T13:00:00.000Z", null, "qc_passed", NOW)).toBe(false);
  });
});
