export type IndividualPlanId =
  | "plus_monthly"
  | "plus_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "max_monthly"
  | "max_yearly"
  | "pro_lifetime";

export type TeamPlanId =
  | "pro_team_monthly"
  | "pro_team_yearly"
  | "max_team_monthly"
  | "max_team_yearly";

export type BillingPlanId = IndividualPlanId | TeamPlanId;

export type BillingPlan = {
  id: BillingPlanId;
  lookupKey: string;
};

export type ClientPlan = {
  id: BillingPlanId;
  lookupKey: string;
  priceId: string | null;
  mode: "subscription" | "payment" | null;
  amount: number | null;
  originalAmount?: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number;
  isTeamPlan: boolean;
  limitedTimeOfferEndsAt?: string | null;
};

export const billingPlans: BillingPlan[] = [
  {
    id: "plus_monthly",
    lookupKey: "plus_monthly",
  },
  {
    id: "plus_yearly",
    lookupKey: "plus_yearly",
  },
  {
    id: "pro_monthly",
    lookupKey: "pro_monthly",
  },
  {
    id: "pro_yearly",
    lookupKey: "pro_yearly",
  },
  {
    id: "max_monthly",
    lookupKey: "max_monthly",
  },
  {
    id: "max_yearly",
    lookupKey: "max_yearly",
  },
  {
    id: "pro_lifetime",
    lookupKey: "pro_lifetime",
  },
  {
    id: "pro_team_monthly",
    lookupKey: "pro_team_monthly",
  },
  {
    id: "pro_team_yearly",
    lookupKey: "pro_team_yearly",
  },
  {
    id: "max_team_monthly",
    lookupKey: "max_team_monthly",
  },
  {
    id: "max_team_yearly",
    lookupKey: "max_team_yearly",
  },
];

const planIdToTier = new Map<BillingPlanId, "plus" | "pro" | "max" | "team">([
  ["plus_monthly", "plus"],
  ["plus_yearly", "plus"],
  ["pro_monthly", "pro"],
  ["pro_yearly", "pro"],
  ["pro_lifetime", "pro"],
  ["max_monthly", "max"],
  ["max_yearly", "max"],
  ["pro_team_monthly", "team"],
  ["pro_team_yearly", "team"],
  ["max_team_monthly", "team"],
  ["max_team_yearly", "team"],
]);

export function findPlanById(planId: BillingPlanId | string) {
  return billingPlans.find((plan) => plan.id === planId);
}

export function findPlanByLookupKey(lookupKey: string | null | undefined) {
  if (!lookupKey) {
    return undefined;
  }
  return billingPlans.find((plan) => plan.lookupKey === lookupKey);
}

export function isTeamPlanId(planId: string | null | undefined): planId is TeamPlanId {
  return planId != null && planIdToTier.get(planId as BillingPlanId) === "team";
}

export function isIndividualPlanId(planId: string | null | undefined): planId is IndividualPlanId {
  if (planId == null) {
    return false;
  }

  const tier = planIdToTier.get(planId as BillingPlanId);
  return tier != null && tier !== "team";
}

export function isTeamPlan(planId: string | null | undefined): boolean {
  return Boolean(planId?.startsWith("pro_team") || planId?.startsWith("max_team"));
}

export function isMaxTeamPlan(planId: string | null | undefined): boolean {
  return Boolean(planId?.startsWith("max_team"));
}

export function getPlanTier(
  planId: string | null | undefined,
): "plus" | "pro" | "max" | "team" | null {
  if (!planId) {
    return null;
  }

  return planIdToTier.get(planId as BillingPlanId) ?? null;
}

export function isProOrHigherTier(planId: string | null | undefined): boolean {
  const tier = getPlanTier(planId);
  return tier === "pro" || tier === "max" || tier === "team";
}
