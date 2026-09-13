import { describe, expect, it } from "vitest";
import { ADMIN_MESSAGE_STATUSES, adminMessageTimestamps, parseAdminMessageUpdate } from "./adminMessage";
const id = "2f5f3f9e-2709-4a6c-b0c1-bb8fda14d8c2";
describe("parseAdminMessageUpdate", () => {
  it.each(ADMIN_MESSAGE_STATUSES)("accepts the %s state", (status) => { expect(parseAdminMessageUpdate({ id, status }).ok).toBe(true); });
  it("normalizes and caps private notes", () => { const result = parseAdminMessageUpdate({ id, status: "read", adminNotes: `  ${"x".repeat(5_100)}  ` }); expect(result.ok).toBe(true); if (result.ok) expect(result.value.adminNote).toHaveLength(5_000); });
  it.each([["invalid identifier", { id: "message-1", status: "read" }], ["unknown status", { id, status: "deleted" }], ["array payload", []], ["null payload", null]])("rejects %s", (_label, payload) => { expect(parseAdminMessageUpdate(payload).ok).toBe(false); });
});
describe("adminMessageTimestamps", () => {
  const now = "2026-09-13T12:00:00.000Z";
  it("marks every handled state as read", () => { expect(adminMessageTimestamps("in_progress", now)).toEqual({ read_at: now }); });
  it("adds terminal lifecycle timestamps", () => { expect(adminMessageTimestamps("replied", now)).toEqual({ read_at: now, replied_at: now }); expect(adminMessageTimestamps("closed", now)).toEqual({ read_at: now, closed_at: now }); expect(adminMessageTimestamps("archived", now)).toEqual({ read_at: now, archived_at: now }); });
  it("does not mark an unread reset as read", () => { expect(adminMessageTimestamps("unread", now)).toEqual({}); });
});
