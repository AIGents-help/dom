import { describe, it, expect } from "vitest";
import {
  mapEventToStatusTransition, classifyIntent, mapCategoryToEffect,
  isDuplicateKeyError, SMARTLEAD_REPLY_CATEGORIES,
} from "./smartleadMapping";
import { AUTO_TRANSITION_LOCKED_STATUSES } from "./leadsPipeline";

describe("mapEventToStatusTransition", () => {
  it("moves a pre-outreach lead to contacted on first send", () => {
    expect(mapEventToStatusTransition("new", "EMAIL_SENT")).toBe("contacted");
    expect(mapEventToStatusTransition("outreach_scheduled", "FIRST_EMAIL_SENT")).toBe("contacted");
  });

  it("never transitions a locked status forward", () => {
    for (const status of AUTO_TRANSITION_LOCKED_STATUSES) {
      expect(mapEventToStatusTransition(status, "EMAIL_SENT")).toBeNull();
      expect(mapEventToStatusTransition(status, "LEAD_UNSUBSCRIBED")).toBeNull();
    }
  });

  it("unsubscribe forces do_not_contact for a non-locked status", () => {
    expect(mapEventToStatusTransition("contacted", "LEAD_UNSUBSCRIBED")).toBe("do_not_contact");
  });

  it("opens/clicks never change status", () => {
    expect(mapEventToStatusTransition("contacted", "EMAIL_OPEN")).toBeNull();
    expect(mapEventToStatusTransition("contacted", "EMAIL_LINK_CLICK")).toBeNull();
  });

  it("bounce does not force a status change (handled via bounce_status instead)", () => {
    expect(mapEventToStatusTransition("contacted", "EMAIL_BOUNCE")).toBeNull();
  });
});

describe("classifyIntent", () => {
  it("classifies interested/not-interested/ooo/unknown", () => {
    expect(classifyIntent("Sounds good, let's talk this week")).toBe("interested");
    expect(classifyIntent("Please remove me from this list")).toBe("not_interested");
    expect(classifyIntent("I am out of office until Monday")).toBe("ooo");
    expect(classifyIntent("What is this regarding?")).toBe("unknown");
    expect(classifyIntent(undefined)).toBe("unknown");
  });
});

describe("mapCategoryToEffect", () => {
  it("covers all 9 official Smartlead reply categories without throwing", () => {
    for (const category of SMARTLEAD_REPLY_CATEGORIES) {
      const effect = mapCategoryToEffect(category);
      expect(effect).toHaveProperty("status");
      expect(effect).toHaveProperty("followUp");
      expect(effect).toHaveProperty("permanent");
    }
  });

  it("Interested and Meeting Request both need urgent response", () => {
    expect(mapCategoryToEffect("Interested").status).toBe("needs_response");
    expect(mapCategoryToEffect("Meeting Request").status).toBe("needs_response");
    expect(mapCategoryToEffect("Interested").followUp?.dueInDays).toBe(0);
  });

  it("Not Interested maps to lost, non-permanent", () => {
    const effect = mapCategoryToEffect("Not Interested");
    expect(effect.status).toBe("lost");
    expect(effect.permanent).toBe(false);
  });

  it("Do Not Contact is the only permanent effect among the 9", () => {
    expect(mapCategoryToEffect("Do Not Contact")).toEqual({ status: "do_not_contact", followUp: null, permanent: true });
    for (const category of SMARTLEAD_REPLY_CATEGORIES) {
      if (category === "Do Not Contact") continue;
      expect(mapCategoryToEffect(category).permanent).toBe(false);
    }
  });

  it("Out Of Office schedules a follow-up rather than declaring a final status", () => {
    const effect = mapCategoryToEffect("Out Of Office");
    expect(effect.status).toBe("follow_up");
    expect(effect.followUp?.dueInDays).toBeGreaterThan(0);
  });

  it("an unrecognized category falls back to needs_response, not a guess", () => {
    const effect = mapCategoryToEffect("Some Future Category Smartlead Adds Later");
    expect(effect.status).toBe("needs_response");
  });
});

describe("isDuplicateKeyError", () => {
  it("recognizes Postgres unique-violation code 23505", () => {
    expect(isDuplicateKeyError({ code: "23505" })).toBe(true);
    expect(isDuplicateKeyError({ code: "23502" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
  });
});
