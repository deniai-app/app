import type { BillingPlanId, ClientPlan } from "@/lib/billing";
import { getPlanTier, isMaxTeamPlan } from "@/lib/billing";
import { formatMinorCurrency } from "@/lib/currency";
import { useExtracted, useLocale } from "next-intl";

export const ACTIVE_STATUSES = new Set(["active", "trialing", "paid"]);
export const BILLING_PLANS_SECTION_ID = "billing-plans";

/** Whole-percent discount of a limited-time offer price, or 0 when none applies. */
export function getOfferPercentOff(plan: ClientPlan | null | undefined) {
  if (!plan?.limitedTimeOfferEndsAt || !plan.originalAmount || plan.amount == null) {
    return 0;
  }
  return Math.round((1 - plan.amount / plan.originalAmount) * 100);
}

export function useFormatPriceLabel() {
  const t = useExtracted();
  const locale = useLocale();
  return (plan: ClientPlan) => {
    const mode = plan.mode ?? "subscription";
    if (!plan.amount || !plan.currency) {
      return t("Set price in Stripe");
    }

    const base = formatMinorCurrency(
      plan.amount,
      plan.currency,
      {
        currencyDisplay: "code",
        maximumFractionDigits: 0,
      },
      locale,
    );

    if (mode === "payment") {
      return t("{price} one-time", { price: base });
    }

    if (!plan.interval) {
      return base;
    }

    const localizedInterval =
      plan.interval === "month" ? t("month") : plan.interval === "year" ? t("year") : plan.interval;

    const interval =
      plan.intervalCount && plan.intervalCount > 1
        ? `${plan.intervalCount} ${localizedInterval}`
        : localizedInterval;

    return t("{price}/{interval}", { price: base, interval });
  };
}

export function useFormatCurrencyMinor() {
  const locale = useLocale();
  return (amountMinor: number, currency?: string | null) =>
    formatMinorCurrency(amountMinor, currency, { currencyDisplay: "code" }, locale);
}

export function calculateYearlySavingsPercent(
  yearlyPlan?: ClientPlan | null,
  monthlyPlan?: ClientPlan | null,
) {
  if (
    !yearlyPlan?.amount ||
    !monthlyPlan?.amount ||
    yearlyPlan.currency !== monthlyPlan.currency ||
    monthlyPlan.amount <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(((monthlyPlan.amount * 12 - yearlyPlan.amount) / (monthlyPlan.amount * 12)) * 100),
  );
}

export function usePlanIntervalLabel() {
  const t = useExtracted();
  return (planId: BillingPlanId) => {
    if (planId.endsWith("_monthly")) {
      return t("Monthly");
    }
    if (planId.endsWith("_yearly")) {
      return t("Yearly");
    }
    if (planId.endsWith("_lifetime")) {
      return t("Lifetime");
    }
    return "";
  };
}

export function useBillingReceiptCopy() {
  const t = useExtracted();
  const getTierLabel = useTierLabel();

  return (planId: string | null | undefined, homeHref: string, homeLabel: string) => {
    const tierLabel = planId ? getTierLabel(planId) : t("Checkout");
    const planTitle =
      getPlanTier(planId) === "team"
        ? isMaxTeamPlan(planId)
          ? t("Max for Teams")
          : t("Pro for Teams")
        : t("{tier} plan", { tier: tierLabel });
    const planDescription = planId?.endsWith("_yearly")
      ? t("Annual subscription")
      : planId?.endsWith("_lifetime")
        ? t("Lifetime access")
        : t("Monthly subscription");

    return {
      planTitle,
      planDescription,
      planLineLabel: planTitle,
      homeHref,
      homeLabel,
    };
  };
}

export function useTierLabel() {
  const t = useExtracted();

  return (planId: string) => {
    const tier = getPlanTier(planId);
    if (tier === "max") {
      return t("Max");
    }
    if (tier === "team") {
      return t("Team");
    }
    if (tier === "pro") {
      return t("Pro");
    }

    return t("Plus");
  };
}

export function usePlanFitCopy() {
  const t = useExtracted();

  return (planId: BillingPlanId) => {
    const tier = getPlanTier(planId);
    if (tier === "max") {
      return t("Best when limits are blocking your daily work.");
    }
    if (tier === "pro") {
      return t("Best for regular projects and premium model usage.");
    }
    if (tier === "team") {
      return isMaxTeamPlan(planId)
        ? t("Best for teams that need Max-tier usage.")
        : t("Best for shared workspaces and centralized billing.");
    }

    return t("Best first upgrade from the free plan.");
  };
}
