"use client";

import { useExtracted } from "next-intl";

import type { BillingPlanId } from "@/lib/billing";

export type BillingPlanCopy = {
  tagline: string;
  highlights: string[];
  badge?: string;
};

// Multipliers vs. the next-lower tier. Kept here in sync with USAGE_LIMITS
// in src/lib/usage.ts. Displaying ratios against the adjacent tier (rather
// than raw token counts or always-vs-Free) keeps the copy meaningful as
// the weighting scheme evolves and makes upgrade value tangible.
//   plus  → vs Free  (basic 150/10=15, premium 50/2=25)
//   pro   → vs Plus  (basic 300/150=2, premium 150/50=3)
//   max   → vs Pro   (basic 800/300≈2.7, premium 450/150=3)
const PLAN_USAGE_MULTIPLIERS = {
  plus: { basic: 15, premium: 25, vs: "Free" as const },
  pro: { basic: 2, premium: 3, vs: "Plus" as const },
  max: { basic: 2.7, premium: 3, vs: "Pro" as const },
} as const;

export function useBillingPlanCopy(planId: BillingPlanId): BillingPlanCopy;
export function useBillingPlanCopy(planId: null): null;
export function useBillingPlanCopy(planId: BillingPlanId | null): BillingPlanCopy | null;
export function useBillingPlanCopy(planId: BillingPlanId | null): BillingPlanCopy | null {
  const t = useExtracted();

  if (!planId) {
    return null;
  }

  switch (planId) {
    case "plus_monthly":
      return {
        tagline: t("Get unbelievable usage limits"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.plus.basic),
            plan: PLAN_USAGE_MULTIPLIERS.plus.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.plus.premium),
            plan: PLAN_USAGE_MULTIPLIERS.plus.vs,
          }),
          t("No ads experience"),
          t("Get more models in Deni AI Flixa"),
          t("For trying Deni AI"),
        ],
      };
    case "plus_yearly":
      return {
        tagline: t("Incredible deal"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.plus.basic),
            plan: PLAN_USAGE_MULTIPLIERS.plus.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.plus.premium),
            plan: PLAN_USAGE_MULTIPLIERS.plus.vs,
          }),
          t("With priority support"),
          t("Deni AI Flixa - Plus access"),
          t("Most cost-effective"),
        ],
      };
    case "pro_monthly":
      return {
        tagline: t("Great deals even for power users"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.basic),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.premium),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Deni AI Flixa - Pro access"),
          t("For power users"),
        ],
      };
    case "pro_yearly":
      return {
        tagline: t("You like us, and we like you too!"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.basic),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.premium),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Deni AI Flixa - Pro access"),
          t("For power users"),
        ],
      };
    case "max_monthly":
      return {
        tagline: t("Get unbelievable usage limits"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.basic),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.premium),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Deni AI Flixa - Max access"),
          t("For power users"),
        ],
      };
    case "max_yearly":
      return {
        tagline: t("Incredible deal"),
        badge: t("Most cost-effective"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.basic),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.premium),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Deni AI Flixa - Max access"),
          t("For power users"),
        ],
      };
    case "pro_lifetime":
      return {
        tagline: t("One payment. Long-term Pro access."),
        badge: t("Buy once"),
        highlights: [
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.basic),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.premium),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Deni AI Flixa - Pro access"),
          t("No recurring subscription"),
        ],
      };
    case "pro_team_monthly":
      return {
        tagline: t("Give your whole team Pro-tier access with per-seat pricing."),
        highlights: [
          t("Pro benefits for every team member"),
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.basic),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.premium),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Per-seat billing — pay only for active members"),
          t("Centralized billing and member management"),
        ],
      };
    case "pro_team_yearly":
      return {
        tagline: t("Give your whole team Pro-tier access with per-seat pricing."),
        badge: t("Most cost-effective"),
        highlights: [
          t("Pro benefits for every team member"),
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.basic),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.pro.premium),
            plan: PLAN_USAGE_MULTIPLIERS.pro.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Per-seat billing — pay only for active members"),
          t("Centralized billing and member management"),
        ],
      };
    case "max_team_monthly":
      return {
        tagline: t("Give your whole team Max-tier access with per-seat pricing."),
        highlights: [
          t("Max benefits for every team member"),
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.basic),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.premium),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Per-seat billing — pay only for active members"),
          t("Centralized billing and member management"),
        ],
      };
    case "max_team_yearly":
      return {
        tagline: t("Give your whole team Max-tier access with per-seat pricing."),
        badge: t("Most cost-effective"),
        highlights: [
          t("Max benefits for every team member"),
          t("{multiplier}× more basic-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.basic),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("{multiplier}× more premium-model usage than {plan}", {
            multiplier: String(PLAN_USAGE_MULTIPLIERS.max.premium),
            plan: PLAN_USAGE_MULTIPLIERS.max.vs,
          }),
          t("Max Mode pay-per-use available"),
          t("Per-seat billing — pay only for active members"),
          t("Centralized billing and member management"),
        ],
      };
    default:
      return null;
  }
}
