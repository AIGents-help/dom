import { describe, expect, it } from "vitest";
import {
  canUseDominicFeature,
  dominicRequiredPlan,
  resolveDominicAccess,
} from "./dominicEntitlements";

describe("DOMINIC entitlements", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");

  it("keeps permanent Free access to Home, Capture Planner, and previews", () => {
    const access = resolveDominicAccess({
      plan: "free",
      status: "active",
      trial_ends_at: "2026-09-01T00:00:00Z",
    }, now);

    expect(canUseDominicFeature(access, "home")).toBe(true);
    expect(canUseDominicFeature(access, "capture_planner")).toBe(true);
    expect(canUseDominicFeature(access, "preview_modules")).toBe(true);
    expect(canUseDominicFeature(access, "mapping")).toBe(false);
    expect(canUseDominicFeature(access, "hub")).toBe(false);
  });

  it("treats an active Free trial as Operator access, but not Organization HUB access", () => {
    const access = resolveDominicAccess({
      plan: "free",
      status: "active",
      trial_ends_at: "2026-10-20T00:00:00Z",
    }, now);

    expect(access.trialActive).toBe(true);
    expect(access.effectivePlan).toBe("operator");
    expect(canUseDominicFeature(access, "mapping")).toBe(true);
    expect(canUseDominicFeature(access, "hub")).toBe(false);
  });

  it("lets Team inherit Operator mapping and reserves HUB for Organization", () => {
    const team = resolveDominicAccess({ plan: "team", status: "active", trial_ends_at: null }, now);
    const organization = resolveDominicAccess({ plan: "organization", status: "active", trial_ends_at: null }, now);

    expect(canUseDominicFeature(team, "mapping")).toBe(true);
    expect(canUseDominicFeature(team, "hub")).toBe(false);
    expect(canUseDominicFeature(organization, "hub")).toBe(true);
  });

  it("blocks suspended profiles regardless of paid plan", () => {
    const access = resolveDominicAccess({ plan: "organization", status: "suspended", trial_ends_at: null }, now);
    expect(canUseDominicFeature(access, "home")).toBe(false);
    expect(canUseDominicFeature(access, "hub")).toBe(false);
  });

  it("declares the same minimum plans used by UI and API gates", () => {
    expect(dominicRequiredPlan("mapping")).toBe("operator");
    expect(dominicRequiredPlan("hub")).toBe("organization");
  });
});
