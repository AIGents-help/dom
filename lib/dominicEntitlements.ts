export type DominicPlan = "free" | "operator" | "team" | "organization";
export type DominicFeature = "home" | "capture_planner" | "preview_modules" | "mapping" | "hub";

export interface DominicProfileEntitlement {
  plan: DominicPlan;
  status: string;
  trial_ends_at?: string | null;
}

export interface DominicAccess {
  plan: DominicPlan;
  effectivePlan: DominicPlan;
  status: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  premiumIncluded: boolean;
}

const PLAN_RANK: Record<DominicPlan, number> = {
  free: 0,
  operator: 1,
  team: 2,
  organization: 3,
};

const FEATURE_MIN_PLAN: Record<DominicFeature, DominicPlan> = {
  home: "free",
  capture_planner: "free",
  preview_modules: "free",
  mapping: "operator",
  hub: "organization",
};

export function normalizeDominicPlan(value: unknown): DominicPlan {
  return value === "operator" || value === "team" || value === "organization" ? value : "free";
}

export function resolveDominicAccess(
  profile: DominicProfileEntitlement | null | undefined,
  nowMs: number = Date.now(),
  pilotSubscriptionActive = false,
): DominicAccess {
  const plan = normalizeDominicPlan(profile?.plan);
  const status = profile?.status ?? "missing";
  const trialEndsAt = profile?.trial_ends_at ?? null;
  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : Number.NaN;
  const trialActive =
    status === "active"
    && plan === "free"
    && Number.isFinite(trialEndMs)
    && trialEndMs > nowMs;

  const premiumIncluded = status === "active" && pilotSubscriptionActive;
  return {
    plan,
    effectivePlan: premiumIncluded ? "organization" : trialActive ? "operator" : plan,
    status,
    trialActive,
    trialEndsAt,
    premiumIncluded,
  };
}

export function canUseDominicFeature(
  access: DominicAccess,
  feature: DominicFeature,
): boolean {
  if (access.status !== "active") return false;
  return PLAN_RANK[access.effectivePlan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function dominicRequiredPlan(feature: DominicFeature): DominicPlan {
  return FEATURE_MIN_PLAN[feature];
}

export function dominicPlanLabel(plan: DominicPlan): string {
  return plan === "free"
    ? "DOMINIC Free"
    : plan === "operator"
      ? "Operator License"
      : plan === "team"
        ? "Team License"
        : "Organization License";
}
