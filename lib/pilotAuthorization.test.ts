import { describe, expect, it } from "vitest";
import { getPilotAuthorizationState, hasCurrentPersonalInsurance } from "./pilotAuthorization";

const future = "2099-01-01";
const past = "2020-01-01";

describe("pilot authorization", () => {
  it("treats a current verified policy as active coverage", () => {
    expect(hasCurrentPersonalInsurance({ insurance_verified: true, insurance_expires_on: future }, 0)).toBe(true);
    expect(hasCurrentPersonalInsurance({ insurance_verified: true, insurance_expires_on: past }, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("authorizes self-service through the admin-approved uninsured path", () => {
    const state = getPilotAuthorizationState({
      status: "active",
      part107_verified: true,
      insurance_verified: false,
      insurance_expires_on: null,
      uninsured_self_service_eligible: true,
      can_create_missions: true,
    });
    expect(state.selfServiceAuthorized).toBe(true);
    expect(state.needsMissionUninsuredAcknowledgement).toBe(true);
  });

  it("does not confuse self-service authorization with insurance verification", () => {
    const state = getPilotAuthorizationState({
      status: "active",
      part107_verified: true,
      insurance_verified: false,
      insurance_expires_on: null,
      uninsured_self_service_eligible: false,
      can_create_missions: true,
    });
    expect(state.personalInsuranceCurrent).toBe(false);
    expect(state.selfServiceAuthorized).toBe(false);
  });
});
