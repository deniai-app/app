"use client";

import { useExtracted } from "next-intl";
import { PlanHighlights } from "@/components/billing/plan-highlights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { type TeamPlanId, isMaxTeamPlan, isTeamPlanId } from "@/lib/billing";
import { useBillingPlanCopy } from "@/lib/billing-plan-copy";
import { formatCurrency, monthDayFormatter, monthDayYearFormatter } from "./team-utils";

type TeamPlan = {
  id: string;
  amount: number | null;
  currency: string | null;
};

type BillingStatus = {
  planId?: string | null;
  status?: string | null;
  memberCount?: number | null;
  currentPeriodEnd?: Date | string | null;
  cancelAt?: number | null;
};

const TEAM_PLAN_ORDER: TeamPlanId[] = [
  "pro_team_monthly",
  "pro_team_yearly",
  "max_team_monthly",
  "max_team_yearly",
];

function TeamPlanOfferCard({
  plan,
  isCurrent,
  checkoutPending,
  checkoutPlanId,
  changePending,
  changePlanId,
  canSwitch,
  onSelect,
}: {
  plan: TeamPlan;
  isCurrent: boolean;
  checkoutPending: boolean;
  checkoutPlanId?: string;
  changePending: boolean;
  changePlanId?: string;
  canSwitch: boolean;
  onSelect: (planId: TeamPlanId) => void;
}) {
  const t = useExtracted();
  const planId = isTeamPlanId(plan.id) ? plan.id : null;
  const copy = useBillingPlanCopy(planId);
  if (!planId || !copy) {
    return null;
  }

  const isMax = isMaxTeamPlan(planId);
  const isYearly = planId.endsWith("_yearly");
  const title = isMax ? t("Max for Teams") : t("Pro for Teams");
  const intervalLabel = isYearly ? t("year") : t("month");
  const isSelecting =
    (checkoutPending && checkoutPlanId === planId) || (changePending && changePlanId === planId);
  const busy = checkoutPending || changePending;

  return (
    <Card className="flex flex-col border-muted">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {copy.badge ? (
                <Badge variant="secondary" className="text-xs">
                  {copy.badge}
                </Badge>
              ) : null}
            </div>
            <CardDescription className="text-sm">{copy.tagline}</CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {isYearly ? t("Yearly") : t("Monthly")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        <p className="text-2xl font-bold">
          {formatCurrency(plan.amount, plan.currency)}
          <span className="text-sm font-normal text-muted-foreground">
            /{t("seat")}/{intervalLabel}
          </span>
        </p>
        <PlanHighlights items={copy.highlights} className="mt-5 flex-1" />
        <Button
          className="mt-5 w-full"
          disabled={busy || isCurrent}
          onClick={() => onSelect(planId)}
        >
          {isSelecting ? <Spinner className="size-3.5" /> : null}
          {isCurrent ? t("Current plan") : canSwitch ? t("Switch") : t("Subscribe")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function TeamBillingCard({
  isOwner,
  isLoading,
  billingStatus,
  plans,
  checkoutPending,
  checkoutPlanId,
  changePending,
  changePlanId,
  cancelPending,
  resumePending,
  onSubscribe,
  onChangePlan,
  onManage,
  onCancel,
  onResume,
}: {
  isOwner: boolean;
  isLoading: boolean;
  billingStatus?: BillingStatus | null;
  plans: TeamPlan[];
  checkoutPending: boolean;
  checkoutPlanId?: string;
  changePending: boolean;
  changePlanId?: string;
  cancelPending: boolean;
  resumePending: boolean;
  onSubscribe: (planId: TeamPlanId) => void;
  onChangePlan: (planId: TeamPlanId) => void;
  onManage: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  const t = useExtracted();
  const hasActivePlan =
    billingStatus?.status &&
    ["active", "trialing", "past_due", "incomplete", "unpaid", "canceled"].includes(
      billingStatus.status,
    );
  const isCanceled = Boolean(billingStatus?.cancelAt) || billingStatus?.status === "canceled";
  const currentPlanId = billingStatus?.planId ?? null;
  const currentTitle = isMaxTeamPlan(currentPlanId) ? t("Max for Teams") : t("Pro for Teams");
  const orderedPlans = TEAM_PLAN_ORDER.map((id) => plans.find((plan) => plan.id === id)).filter(
    (plan): plan is TeamPlan => Boolean(plan),
  );
  const canSwitch = Boolean(hasActivePlan && isOwner && !isCanceled);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Team Billing")}</CardTitle>
        <CardDescription>
          {t("Team plans give every member Pro or Max access with per-seat pricing.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Spinner />
        ) : hasActivePlan || isCanceled ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium mb-1.5">
                  {currentTitle}
                  {isCanceled && (
                    <Badge variant="secondary">
                      {t("Cancels")}{" "}
                      {billingStatus?.cancelAt
                        ? monthDayFormatter.format(new Date(billingStatus.cancelAt * 1000))
                        : billingStatus?.currentPeriodEnd
                          ? monthDayFormatter.format(new Date(billingStatus.currentPeriodEnd))
                          : ""}
                    </Badge>
                  )}
                  {hasActivePlan && !isCanceled && <Badge className="ml-1.5">{t("Active")}</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {billingStatus?.memberCount ?? 0} {t("seats")}
                  {billingStatus?.currentPeriodEnd &&
                    ` · ${t("Renews")} ${monthDayYearFormatter.format(new Date(billingStatus.currentPeriodEnd))}`}
                </p>
              </div>
              <div className="flex gap-2">
                {isOwner && (
                  <Button variant="outline" size="sm" onClick={onManage}>
                    {t("Manage")}
                  </Button>
                )}
                {isCanceled ? (
                  <Button size="sm" onClick={onResume} disabled={resumePending}>
                    {resumePending && <Spinner className="size-3.5" />}
                    {t("Resume")}
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onCancel}
                    disabled={cancelPending}
                  >
                    {cancelPending && <Spinner className="size-3.5" />}
                    {t("Cancel")}
                  </Button>
                )}
              </div>
            </div>
            {isOwner && orderedPlans.length > 0 && !isCanceled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {orderedPlans.map((plan) => (
                  <TeamPlanOfferCard
                    key={plan.id}
                    plan={plan}
                    isCurrent={plan.id === currentPlanId}
                    checkoutPending={checkoutPending}
                    checkoutPlanId={checkoutPlanId}
                    changePending={changePending}
                    changePlanId={changePlanId}
                    canSwitch={canSwitch}
                    onSelect={canSwitch ? onChangePlan : onSubscribe}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : isOwner ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {orderedPlans.map((plan) => (
              <TeamPlanOfferCard
                key={plan.id}
                plan={plan}
                isCurrent={false}
                checkoutPending={checkoutPending}
                checkoutPlanId={checkoutPlanId}
                changePending={false}
                canSwitch={false}
                onSelect={onSubscribe}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Ask a team owner to subscribe to a plan.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
