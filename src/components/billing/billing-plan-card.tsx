"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import type { ClientPlan, IndividualPlanId } from "@/lib/billing";
import { useBillingPlanCopy } from "@/lib/billing-plan-copy";
import { formatMinorCurrency } from "@/lib/currency";
import { formatAppDate } from "@/lib/format-date";
import { useFormatPriceParts } from "@/lib/use-format-price-parts";
import { cn } from "@/lib/utils";
import { PlanHighlights } from "./plan-highlights";
import {
  calculateYearlySavingsPercent,
  useFormatPriceLabel,
  usePlanFitCopy,
  useTierLabel,
} from "./billing-utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Spinner } from "../ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export function PlanCard({
  plan,
  monthlyPlan,
  interval,
  onIntervalChange,
  status,
  cancelDate,
  activePlanId,
  changePlan,
  checkout,
  onChangePlanClick,
  onCheckout,
}: {
  plan: ClientPlan;
  monthlyPlan?: ClientPlan;
  interval?: "monthly" | "yearly";
  onIntervalChange?: (interval: "monthly" | "yearly") => void;
  status: {
    isCurrent: boolean;
    hasActiveSubscription: boolean;
    isLoadingEstimate: boolean;
    isOnTeamPlan?: boolean;
  };
  cancelDate: number | null;
  activePlanId: string | undefined;
  changePlan: { isPending: boolean; variables?: { planId: IndividualPlanId } };
  checkout: { isPending: boolean; variables?: { planId: IndividualPlanId } };
  onChangePlanClick: (plan: ClientPlan) => void;
  onCheckout: (planId: IndividualPlanId) => void;
}) {
  const t = useExtracted();
  const locale = useLocale();
  const formatPriceLabel = useFormatPriceLabel();
  const formatPriceParts = useFormatPriceParts();
  const getTierLabel = useTierLabel();
  const getPlanFitCopy = usePlanFitCopy();
  const planCopy = useBillingPlanCopy(plan.id);
  const mode = plan.mode ?? "subscription";
  const offerEndsLabel = plan.limitedTimeOfferEndsAt
    ? formatAppDate(plan.limitedTimeOfferEndsAt, locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const canChange =
    status.hasActiveSubscription && !cancelDate && !status.isCurrent && mode === "subscription";
  const isBlockedByCancel =
    Number.isInteger(cancelDate) && Boolean(activePlanId) && !status.isCurrent;
  const processing =
    (changePlan.isPending && changePlan.variables?.planId === plan.id) ||
    (checkout.isPending && checkout.variables?.planId === plan.id);
  const isLoadingThisPlan = status.isLoadingEstimate;

  const tierName = getTierLabel(plan.id);
  const priceParts =
    plan.amount && plan.currency ? formatPriceParts(plan.amount, plan.currency) : null;
  const monthlyEquivalent =
    mode === "subscription" && interval === "yearly" && plan.amount && plan.currency
      ? formatMinorCurrency(
          Math.round(plan.amount / 12),
          plan.currency,
          {
            currencyDisplay: "code",
            maximumFractionDigits: 0,
          },
          locale,
        )
      : null;
  const savingsPercent =
    mode === "subscription" && interval === "yearly"
      ? calculateYearlySavingsPercent(plan, monthlyPlan)
      : 0;
  const primaryActionLabel = status.isOnTeamPlan
    ? t("Team plan active")
    : status.isCurrent
      ? t("Current plan")
      : isBlockedByCancel
        ? t("Resume to change")
        : canChange
          ? t("Change plan")
          : mode === "payment"
            ? t("Buy once")
            : plan.trialDays
              ? t("Start {days}-day trial", { days: plan.trialDays.toString() })
              : t("Subscribe");
  const showTrustCopy = !status.isOnTeamPlan && !status.isCurrent && !isBlockedByCancel;

  return (
    <Card
      className={cn(
        "flex flex-col",
        interval === "yearly" && "border-foreground/20 bg-muted/20",
        status.isCurrent && "border-foreground ring-1 ring-foreground/10",
      )}
    >
      <CardHeader className="pb-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                {tierName}
              </CardTitle>
              {plan.trialDays ? (
                <Badge className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  {t("{days}-day free trial", {
                    days: plan.trialDays.toString(),
                  })}
                </Badge>
              ) : interval === "yearly" && savingsPercent > 0 ? (
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  {t("Save {percent}%", { percent: savingsPercent.toString() })}
                </Badge>
              ) : planCopy.badge ? (
                <Badge variant="secondary" className="text-xs">
                  {planCopy.badge}
                </Badge>
              ) : null}
            </div>
            <CardDescription className="text-sm leading-relaxed">
              {planCopy.tagline}
            </CardDescription>
          </div>
          {mode === "subscription" ? (
            <Tabs
              value={interval}
              onValueChange={(v) => onIntervalChange?.(v as "monthly" | "yearly")}
            >
              <TabsList className="h-8 rounded-xl">
                <TabsTrigger value="monthly" className="h-6 px-3 text-xs rounded-md">
                  {t("Monthly")}
                </TabsTrigger>
                <TabsTrigger value="yearly" className="h-6 px-3 text-xs rounded-md">
                  {t("Yearly")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {t("Lifetime")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        <div className="flex-1">
          <div className="space-y-3">
            {priceParts ? (
              <div className="space-y-1">
                <div className="flex items-start gap-2">
                  <span className="pt-2 text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                    {priceParts.currency}
                  </span>
                  <span className="text-4xl font-semibold tracking-tight">{priceParts.amount}</span>
                  {plan.interval && (
                    <span className="pt-3 text-sm text-muted-foreground">
                      /
                      {plan.interval === "month"
                        ? t("month")
                        : plan.interval === "year"
                          ? t("year")
                          : plan.interval}
                    </span>
                  )}
                </div>
                {plan.originalAmount && plan.currency && (
                  <p className="text-sm text-muted-foreground line-through">
                    {formatMinorCurrency(
                      plan.originalAmount,
                      plan.currency,
                      {
                        currencyDisplay: "code",
                        maximumFractionDigits: 0,
                      },
                      locale,
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-2xl font-semibold tracking-tight">{formatPriceLabel(plan)}</div>
            )}
            {interval === "yearly" && monthlyEquivalent && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t("{amount}/month when billed yearly", {
                    amount: monthlyEquivalent,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("One yearly payment of {price}", {
                    price: formatPriceLabel(plan),
                  })}
                </p>
              </div>
            )}
            {mode === "payment" && (
              <p className="text-sm font-medium text-foreground">{t("One-time purchase")}</p>
            )}
            {offerEndsLabel && (
              <p className="text-xs text-muted-foreground">
                {t("24-hour offer ends {date}", { date: offerEndsLabel })}
              </p>
            )}
          </div>
          <div className="mt-5 rounded-md border border-border/70 bg-background/70 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{getPlanFitCopy(plan.id)}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {plan.trialDays
                    ? t("Try the upgraded limits first. You only continue if it fits.")
                    : interval === "yearly" && savingsPercent > 0
                      ? t("Lock in the lower monthly equivalent for the year.")
                      : mode === "payment"
                        ? t("Keep Pro access without a recurring subscription.")
                        : t("Upgrade now and manage or cancel from billing anytime.")}
                </p>
              </div>
            </div>
          </div>
          <PlanHighlights items={planCopy.highlights} className="mt-5" />
        </div>
        <Button
          className="mt-6 h-auto min-h-12 w-full flex-col gap-1 py-3 font-medium"
          variant={status.isCurrent ? "secondary" : "default"}
          disabled={
            status.isCurrent ||
            processing ||
            isBlockedByCancel ||
            isLoadingThisPlan ||
            status.isOnTeamPlan
          }
          onClick={() => {
            if (canChange) {
              onChangePlanClick(plan);
            } else {
              onCheckout(plan.id as IndividualPlanId);
            }
          }}
        >
          {(processing || isLoadingThisPlan) && <Spinner className="size-4" />}
          <span>{primaryActionLabel}</span>
          {showTrustCopy && (
            <span className="text-[11px] font-normal text-current/80">
              {mode === "payment" ? t("Pay once. Keep access.") : t("Cancel anytime")}
            </span>
          )}
        </Button>
        {showTrustCopy && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            <span>{t("A 3D Secure compatible card is required.")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
