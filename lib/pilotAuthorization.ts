export interface PilotAuthorizationProfile {
  status: string;
  part107_verified: boolean;
  insurance_verified: boolean;
  insurance_expires_on: string | null;
  uninsured_self_service_eligible: boolean;
  can_create_missions: boolean;
}

export function hasCurrentPersonalInsurance(
  profile: Pick<PilotAuthorizationProfile, "insurance_verified" | "insurance_expires_on">,
  nowMs = Date.now(),
): boolean {
  if (!profile.insurance_verified || !profile.insurance_expires_on) return false;
  const expiresMs = new Date(`${profile.insurance_expires_on}T23:59:59Z`).getTime();
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

export function hasCurrentPilotCredentials(
  profile: Pick<PilotAuthorizationProfile, "status" | "part107_verified">,
): boolean {
  return profile.status === "active" && profile.part107_verified;
}

export function getPilotAuthorizationState(
  profile: PilotAuthorizationProfile,
  nowMs = Date.now(),
) {
  const personalInsuranceCurrent = hasCurrentPersonalInsurance(profile, nowMs);
  const uninsuredAuthorized = !!profile.uninsured_self_service_eligible;
  const baseCredentialsCurrent = hasCurrentPilotCredentials(profile);
  const selfServiceAuthorized =
    baseCredentialsCurrent
    && profile.can_create_missions
    && (personalInsuranceCurrent || uninsuredAuthorized);

  return {
    baseCredentialsCurrent,
    personalInsuranceCurrent,
    uninsuredAuthorized,
    selfServiceAuthorized,
    needsMissionUninsuredAcknowledgement:
      selfServiceAuthorized && uninsuredAuthorized && !personalInsuranceCurrent,
  };
}
