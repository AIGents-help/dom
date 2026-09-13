import { describe, expect, it } from "vitest";
import { CONTACT_CATEGORIES, isContactHoneypotFilled, parseContactMessage } from "./contactMessage";

const valid = { name: " Anthony Kates ", email: " Anthony@DroneOpsMan.com ", category: "general_inquiry", subject: " General question ", message: " I would like to learn more. " };

describe("parseContactMessage", () => {
  it("normalizes a valid public message", () => {
    expect(parseContactMessage(valid)).toEqual({ ok: true, value: { name: "Anthony Kates", email: "anthony@droneopsman.com", phone: null, company: null, category: "general_inquiry", subject: "General question", message: "I would like to learn more." } });
  });
  it.each(CONTACT_CATEGORIES)("accepts the %s category", (category) => { expect(parseContactMessage({ ...valid, category }).ok).toBe(true); });
  it.each([
    ["missing name", { ...valid, name: "" }], ["invalid email", { ...valid, email: "not-an-email" }],
    ["missing subject", { ...valid, subject: "" }], ["missing message", { ...valid, message: "" }],
    ["unknown category", { ...valid, category: "mission_request" }], ["non-object payload", null],
  ])("rejects %s", (_label, payload) => { expect(parseContactMessage(payload).ok).toBe(false); });
  it("caps every stored text field", () => {
    const result = parseContactMessage({ ...valid, name: "n".repeat(130), email: `${"e".repeat(300)}@example.com`, phone: "p".repeat(70), company: "c".repeat(170), subject: "s".repeat(190), message: "m".repeat(10_100) });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.name).toHaveLength(120); expect(result.value.email.length).toBeLessThanOrEqual(320);
    expect(result.value.phone).toHaveLength(60); expect(result.value.company).toHaveLength(160);
    expect(result.value.subject).toHaveLength(180); expect(result.value.message).toHaveLength(10_000);
  });
});

describe("isContactHoneypotFilled", () => {
  it("detects bot-filled honeypot values", () => { expect(isContactHoneypotFilled({ website: "https://spam.example" })).toBe(true); });
  it("allows missing and blank honeypot values", () => { expect(isContactHoneypotFilled(valid)).toBe(false); expect(isContactHoneypotFilled({ website: "  " })).toBe(false); });
});
