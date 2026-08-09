import { describe, it, expect } from "vitest";
import {
  type Lead, type LeadContext, type LeadNextAction, type LeadSmartleadStatus,
  LEGACY_STATUS_MAP, matchesSavedView, matchesFilters, matchesOpportunityType,
  isDueToday, isOverdue, scoreLead, findLikelyDuplicates, canEnrollInOutreach,
  isDjiRestricted, normalizeStatus, tierRank, compareLeadsForSort,
} from "./leadsPipeline";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1", name: "Jane Doe", email: "jane@example.com", company: "Acme Co",
    phone: "555-1234", source: null, message: null, status: "new", created_at: "2026-01-01T00:00:00Z",
    tier: [], vertical: null, external_prospect_id: null, preferred_contact_method: null,
    last_contacted_at: null, next_follow_up_at: null, address: "123 Main St, Springfield, IL",
    industry: null, engagement_model: null, opportunity_ownership: null, relationship_type: null,
    service_opportunity: null, dji_permitted: null, ndaa_required: null, blue_uas_required: null,
    total_project_value: null, expected_dom_revenue: null, prime_contractor: null, end_client: null,
    source_url: null, verification_notes: null, next_action: null, smartlead_campaign_id: null,
    smartlead_lead_id: null, outreach_approved_at: null, outreach_paused_at: null, priority_override: null,
    ...overrides,
  };
}

function makeNextAction(overrides: Partial<LeadNextAction> = {}): LeadNextAction {
  return {
    id: "na-1", lead_id: "lead-1", action_type: "Call", due_at: null, status: "open",
    assigned_to: null, notes: null, completed_at: null, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

function makeSmartlead(overrides: Partial<LeadSmartleadStatus> = {}): LeadSmartleadStatus {
  return {
    id: "sl-1", lead_id: "lead-1", campaign_name: null, sequence_step: null, outreach_status: null,
    last_sent_at: null, last_opened_at: null, last_clicked_at: null, last_replied_at: null,
    reply_category: null, bounce_status: null, unsubscribed_at: null, open_count: 0, click_count: 0,
    last_synced_at: null, ...overrides,
  };
}

function makeCtx(lead: Lead, overrides: Partial<Omit<LeadContext, "lead">> = {}): LeadContext {
  return { lead, openNextAction: null, smartlead: null, hasActivity: false, ...overrides };
}

const TODAY = "2026-06-15";

describe("legacy status mapping", () => {
  it("matches the migration's legacy -> new mapping exactly", () => {
    // Kept in sync manually with
    // supabase/migrations/20260803004800_leads_pipeline_status_migration.sql
    expect(LEGACY_STATUS_MAP).toEqual({
      cold: "new",
      contacted: "contacted",
      qualified: "qualified",
      quoted: "proposal",
      scheduled: "outreach_scheduled",
      customer: "won",
      lost: "lost",
    });
  });

  it("normalizeStatus passes through unknown/new-vocabulary values unchanged", () => {
    expect(normalizeStatus("needs_response")).toBe("needs_response");
    expect(normalizeStatus("cold")).toBe("new");
  });
});

describe("matchesSavedView", () => {
  it("all always matches", () => {
    expect(matchesSavedView(makeCtx(makeLead()), "all", TODAY)).toBe(true);
  });

  it("contact_today matches an open next action due today", () => {
    const ctx = makeCtx(makeLead(), { openNextAction: makeNextAction({ due_at: `${TODAY}T09:00:00Z` }) });
    expect(matchesSavedView(ctx, "contact_today", TODAY)).toBe(true);
    expect(matchesSavedView(ctx, "overdue", TODAY)).toBe(false);
  });

  it("overdue matches an open next action due before today", () => {
    const ctx = makeCtx(makeLead(), { openNextAction: makeNextAction({ due_at: "2026-06-01T09:00:00Z" }) });
    expect(matchesSavedView(ctx, "overdue", TODAY)).toBe(true);
    expect(matchesSavedView(ctx, "contact_today", TODAY)).toBe(false);
  });

  it("needs_response matches normalized status", () => {
    const ctx = makeCtx(makeLead({ status: "needs_response" }));
    expect(matchesSavedView(ctx, "needs_response", TODAY)).toBe(true);
  });

  it("high_priority delegates to scoreLead", () => {
    const highLead = makeLead({ priority_override: "high" });
    expect(matchesSavedView(makeCtx(highLead), "high_priority", TODAY)).toBe(true);
    const lowLead = makeLead({ priority_override: "low" });
    expect(matchesSavedView(makeCtx(lowLead), "high_priority", TODAY)).toBe(false);
  });

  it("no_activity matches leads with no logged activity and no send", () => {
    expect(matchesSavedView(makeCtx(makeLead()), "no_activity", TODAY)).toBe(true);
    const ctx = makeCtx(makeLead(), { hasActivity: true });
    expect(matchesSavedView(ctx, "no_activity", TODAY)).toBe(false);
  });

  it("positive_replies matches only the two positive Smartlead categories", () => {
    const interested = makeCtx(makeLead(), { smartlead: makeSmartlead({ reply_category: "Interested" }) });
    const meeting = makeCtx(makeLead(), { smartlead: makeSmartlead({ reply_category: "Meeting Request" }) });
    const notInterested = makeCtx(makeLead(), { smartlead: makeSmartlead({ reply_category: "Not Interested" }) });
    expect(matchesSavedView(interested, "positive_replies", TODAY)).toBe(true);
    expect(matchesSavedView(meeting, "positive_replies", TODAY)).toBe(true);
    expect(matchesSavedView(notInterested, "positive_replies", TODAY)).toBe(false);
  });

  it("opened_no_reply matches opened but not replied", () => {
    const ctx = makeCtx(makeLead(), { smartlead: makeSmartlead({ last_opened_at: "2026-06-01T00:00:00Z" }) });
    expect(matchesSavedView(ctx, "opened_no_reply", TODAY)).toBe(true);
    const replied = makeCtx(makeLead(), { smartlead: makeSmartlead({ last_opened_at: "2026-06-01T00:00:00Z", last_replied_at: "2026-06-02T00:00:00Z" }) });
    expect(matchesSavedView(replied, "opened_no_reply", TODAY)).toBe(false);
  });

  it("campaign_active / sequence_finished match outreach_status", () => {
    const active = makeCtx(makeLead(), { smartlead: makeSmartlead({ outreach_status: "active" }) });
    const finished = makeCtx(makeLead(), { smartlead: makeSmartlead({ outreach_status: "completed" }) });
    expect(matchesSavedView(active, "campaign_active", TODAY)).toBe(true);
    expect(matchesSavedView(finished, "sequence_finished", TODAY)).toBe(true);
    expect(matchesSavedView(active, "sequence_finished", TODAY)).toBe(false);
  });

  it("proposals matches proposal status", () => {
    expect(matchesSavedView(makeCtx(makeLead({ status: "proposal" })), "proposals", TODAY)).toBe(true);
  });

  it("bounced / unsubscribed match their respective fields", () => {
    const bounced = makeCtx(makeLead(), { smartlead: makeSmartlead({ bounce_status: "bounced" }) });
    const unsub = makeCtx(makeLead(), { smartlead: makeSmartlead({ unsubscribed_at: "2026-06-01T00:00:00Z" }) });
    expect(matchesSavedView(bounced, "bounced", TODAY)).toBe(true);
    expect(matchesSavedView(unsub, "unsubscribed", TODAY)).toBe(true);
    expect(matchesSavedView(bounced, "unsubscribed", TODAY)).toBe(false);
  });
});

describe("matchesOpportunityType", () => {
  it("matches direct via dom_owned or direct_project", () => {
    expect(matchesOpportunityType(makeLead({ opportunity_ownership: "dom_owned" }), "direct")).toBe(true);
    expect(matchesOpportunityType(makeLead({ engagement_model: "direct_project" }), "direct")).toBe(true);
    expect(matchesOpportunityType(makeLead({ opportunity_ownership: "partner_owned" }), "direct")).toBe(false);
  });

  it("empty type matches everything", () => {
    expect(matchesOpportunityType(makeLead(), "")).toBe(true);
  });
});

describe("isDjiRestricted", () => {
  it("flags no/ndaa/blue-uas", () => {
    expect(isDjiRestricted(makeLead({ dji_permitted: "no" }))).toBe(true);
    expect(isDjiRestricted(makeLead({ ndaa_required: true }))).toBe(true);
    expect(isDjiRestricted(makeLead({ blue_uas_required: true }))).toBe(true);
    expect(isDjiRestricted(makeLead())).toBe(false);
  });
});

describe("matchesFilters", () => {
  it("filters by status/industry/engagement/ownership/search combined", () => {
    const lead = makeLead({ status: "cold", industry: "utilities", engagement_model: "direct_project", opportunity_ownership: "dom_owned", company: "Acme Utilities" });
    expect(matchesFilters(lead, { search: "", status: "new", industry: "", engagement: "", ownership: "" })).toBe(true); // "cold" normalizes to "new"
    expect(matchesFilters(lead, { search: "", status: "won", industry: "", engagement: "", ownership: "" })).toBe(false);
    expect(matchesFilters(lead, { search: "acme", status: "", industry: "", engagement: "", ownership: "" })).toBe(true);
    expect(matchesFilters(lead, { search: "nomatch", status: "", industry: "", engagement: "", ownership: "" })).toBe(false);
    expect(matchesFilters(lead, { search: "", status: "", industry: "utilities", engagement: "", ownership: "" })).toBe(true);
  });
});

describe("isDueToday / isOverdue", () => {
  it("handles null gracefully", () => {
    expect(isDueToday(null, TODAY)).toBe(false);
    expect(isOverdue(undefined, TODAY)).toBe(false);
  });

  it("compares date-only, ignoring time", () => {
    expect(isDueToday(`${TODAY}T23:59:00Z`, TODAY)).toBe(true);
    expect(isOverdue("2026-06-14T23:59:00Z", TODAY)).toBe(true);
    expect(isOverdue(`${TODAY}T00:00:00Z`, TODAY)).toBe(false);
  });
});

describe("scoreLead", () => {
  it("excludes terminal statuses", () => {
    const result = scoreLead(makeCtx(makeLead({ status: "won" })));
    expect(result.label).toBeNull();
  });

  it("manual override always wins", () => {
    const result = scoreLead(makeCtx(makeLead({ priority_override: "low", industry: "utilities", total_project_value: 100000 })));
    expect(result.label).toBe("low");
    expect(result.manual).toBe(true);
  });

  it("does not let opens alone push score into high", () => {
    const ctx = makeCtx(makeLead({ status: "new" }), {
      smartlead: makeSmartlead({ open_count: 50 }), // absurd open count
    });
    const result = scoreLead(ctx);
    // Even with huge open_count, engagement contributes a flat +1 (capped),
    // so a bare lead with only opens should land low/medium, never high.
    expect(result.label).not.toBe("high");
  });

  it("a strong-fit, high-value, replied lead with a due action scores high", () => {
    const ctx = makeCtx(
      makeLead({ status: "needs_response", industry: "utilities", opportunity_ownership: "dom_owned", total_project_value: 50000, phone: "555" }),
      { smartlead: makeSmartlead({ last_replied_at: "2026-06-10T00:00:00Z", reply_category: "Interested" }), openNextAction: makeNextAction({ due_at: `${TODAY}T09:00:00Z` }) }
    );
    const result = scoreLead(ctx);
    expect(result.label).toBe("high");
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe("findLikelyDuplicates", () => {
  const existing = [makeLead({ id: "a", email: "match@example.com", company: "Acme Inc" })];

  it("matches on normalized email", () => {
    const matches = findLikelyDuplicates(existing, { email: "Match@Example.com " });
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toMatch(/email/i);
  });

  it("excludes the candidate's own id", () => {
    const matches = findLikelyDuplicates(existing, { id: "a", email: "match@example.com" });
    expect(matches).toHaveLength(0);
  });

  it("matches on company + email domain", () => {
    const matches = findLikelyDuplicates(existing, { company: "ACME Inc", email: "someoneelse@example.com" });
    expect(matches.length).toBeGreaterThan(0);
  });

  it("no match for unrelated candidate", () => {
    const matches = findLikelyDuplicates(existing, { email: "nobody@other.com", company: "Totally Different" });
    expect(matches).toHaveLength(0);
  });
});

describe("compareLeadsForSort", () => {
  // Sort a set of leads with the comparator and return their ids in order.
  const order = (leads: Lead[], key: Parameters<typeof compareLeadsForSort>[2], dir: Parameters<typeof compareLeadsForSort>[3] = "asc") =>
    [...leads].sort((a, b) => compareLeadsForSort(a, b, key, dir)).map((l) => l.id);

  it("tierRank ranks Tier 1 highest and unassigned lowest", () => {
    expect(tierRank(makeLead({ tier: ["tier_1"] }))).toBe(1);
    expect(tierRank(makeLead({ tier: ["tier_2"] }))).toBe(2);
    expect(tierRank(makeLead({ tier: ["tier_3"] }))).toBe(3);
    expect(tierRank(makeLead({ tier: [] }))).toBe(99);
    // Multiple tiers → best (lowest-numbered) tier wins.
    expect(tierRank(makeLead({ tier: ["tier_3", "tier_1"] }))).toBe(1);
  });

  it("priority: orders Tier 1 → Tier 2 → Tier 3 → unassigned", () => {
    const leads = [
      makeLead({ id: "unassigned", tier: [], company: "A" }),
      makeLead({ id: "t3", tier: ["tier_3"], company: "A" }),
      makeLead({ id: "t1", tier: ["tier_1"], company: "A" }),
      makeLead({ id: "t2", tier: ["tier_2"], company: "A" }),
    ];
    expect(order(leads, "priority")).toEqual(["t1", "t2", "t3", "unassigned"]);
    // Unassigned stays last even when the direction is flipped.
    expect(order(leads, "priority", "desc")).toEqual(["t3", "t2", "t1", "unassigned"]);
  });

  it("contact: named contacts first (A–Z), leads with no contact last", () => {
    const leads = [
      makeLead({ id: "empty", name: "", company: "A" }),
      makeLead({ id: "nullname", name: null, company: "B" }),
      makeLead({ id: "bob", name: "bob", company: "C" }),
      makeLead({ id: "alice", name: "Alice", company: "D" }),
    ];
    const result = order(leads, "name");
    // Named contacts sorted case-insensitively, then the two contactless leads.
    expect(result.slice(0, 2)).toEqual(["alice", "bob"]);
    expect(result.slice(2).sort()).toEqual(["empty", "nullname"]);
    // No-contact leads remain last even when direction is flipped.
    const flipped = order(leads, "name", "desc");
    expect(flipped.slice(0, 2)).toEqual(["bob", "alice"]);
    expect(flipped.slice(2).sort()).toEqual(["empty", "nullname"]);
  });

  it("company name is the stable secondary sort for equal primary values", () => {
    // Same tier → falls back to company A–Z.
    const sameTier = [
      makeLead({ id: "zeta", tier: ["tier_1"], company: "Zeta" }),
      makeLead({ id: "alpha", tier: ["tier_1"], company: "Alpha" }),
      makeLead({ id: "mid", tier: ["tier_1"], company: "Mid" }),
    ];
    expect(order(sameTier, "priority")).toEqual(["alpha", "mid", "zeta"]);

    // Same contact name → falls back to company A–Z.
    const sameName = [
      makeLead({ id: "z", name: "Sam", company: "Zeta" }),
      makeLead({ id: "a", name: "Sam", company: "Alpha" }),
    ];
    expect(order(sameName, "name")).toEqual(["a", "z"]);
  });
});

describe("canEnrollInOutreach", () => {
  it("blocks do_not_contact", () => {
    const result = canEnrollInOutreach(makeLead({ status: "do_not_contact", email: "a@b.com" }), null);
    expect(result.ok).toBe(false);
  });

  it("blocks unsubscribed", () => {
    const result = canEnrollInOutreach(makeLead({ status: "new", email: "a@b.com" }), makeSmartlead({ unsubscribed_at: "2026-01-01T00:00:00Z" }));
    expect(result.ok).toBe(false);
  });

  it("blocks bounced", () => {
    const result = canEnrollInOutreach(makeLead({ status: "new", email: "a@b.com" }), makeSmartlead({ bounce_status: "bounced" }));
    expect(result.ok).toBe(false);
  });

  it("blocks invalid email", () => {
    const result = canEnrollInOutreach(makeLead({ status: "new", email: "not-an-email" }), null);
    expect(result.ok).toBe(false);
  });

  it("blocks statuses that aren't pre-outreach", () => {
    const result = canEnrollInOutreach(makeLead({ status: "qualified", email: "a@b.com" }), null);
    expect(result.ok).toBe(false);
  });

  it("blocks already-enrolled leads (smartlead_campaign_id set)", () => {
    const result = canEnrollInOutreach(makeLead({ status: "new", email: "a@b.com", smartlead_campaign_id: "123" }), null);
    expect(result.ok).toBe(false);
  });

  it("allows a clean, pre-outreach, valid-email lead", () => {
    const result = canEnrollInOutreach(makeLead({ status: "new", email: "a@b.com" }), null);
    expect(result.ok).toBe(true);
  });
});
