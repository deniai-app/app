"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import type { ClientPlan, IndividualPlanId } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { PlanCard } from "./billing-plan-card";
import { BILLING_PLANS_SECTION_ID } from "./billing-utils";
import { PlanHighlights } from "./plan-highlights";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type PlanActionProps = {
  activePlanId: string | undefined;
  isSubscribed: boolean;
  hasActiveSubscription: boolean;
  isOnTeamPlan: boolean;
  pendingPlanId: IndividualPlanId | null;
  isEstimateLoading: boolean;
  cancelDate: number | null;
  changePlan: { isPending: boolean; variables?: { planId: IndividualPlanId } };
  checkout: { isPending: boolean; variables?: { planId: IndividualPlanId } };
  onChangePlanClick: (plan: ClientPlan) => void;
  onCheckout: (planId: IndividualPlanId) => void;
};

export function BillingPlansSection({
  erroredMessage,
  hasActiveSubscription,
  selectedPlusPlan,
  plusMonthly,
  plusInterval,
  onPlusIntervalChange,
  selectedProPlan,
  proMonthly,
  proInterval,
  onProIntervalChange,
  selectedMaxPlan,
  maxMonthly,
  maxInterval,
  onMaxIntervalChange,
  proLifetime,
  isOnTeamPlan,
  planActions,
}: {
  erroredMessage?: string | null;
  hasActiveSubscription: boolean;
  selectedPlusPlan?: ClientPlan;
  plusMonthly?: ClientPlan;
  plusInterval: "monthly" | "yearly";
  onPlusIntervalChange: (interval: "monthly" | "yearly") => void;
  selectedProPlan?: ClientPlan;
  proMonthly?: ClientPlan;
  proInterval: "monthly" | "yearly";
  onProIntervalChange: (interval: "monthly" | "yearly") => void;
  selectedMaxPlan?: ClientPlan;
  maxMonthly?: ClientPlan;
  maxInterval: "monthly" | "yearly";
  onMaxIntervalChange: (interval: "monthly" | "yearly") => void;
  proLifetime?: ClientPlan;
  isOnTeamPlan: boolean;
  planActions: PlanActionProps;
}) {
  const t = useExtracted();
  const {
    activePlanId,
    isSubscribed,
    pendingPlanId,
    isEstimateLoading,
    cancelDate,
    changePlan,
    checkout,
    onChangePlanClick,
    onCheckout,
  } = planActions;

  if (erroredMessage) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t("Error")}</CardTitle>
          <CardDescription>{erroredMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div id={BILLING_PLANS_SECTION_ID} className="scroll-mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {selectedPlusPlan && (
            <PlanCard
              plan={selectedPlusPlan}
              monthlyPlan={plusMonthly}
              interval={plusInterval}
              onIntervalChange={onPlusIntervalChange}
              status={{
                isCurrent: selectedPlusPlan.id === activePlanId && isSubscribed,
                hasActiveSubscription,
                isLoadingEstimate: pendingPlanId === selectedPlusPlan.id && isEstimateLoading,
                isOnTeamPlan,
              }}
              cancelDate={cancelDate}
              activePlanId={activePlanId}
              changePlan={changePlan}
              checkout={checkout}
              onChangePlanClick={onChangePlanClick}
              onCheckout={onCheckout}
            />
          )}

          {selectedProPlan && (
            <PlanCard
              plan={selectedProPlan}
              monthlyPlan={proMonthly}
              interval={proInterval}
              onIntervalChange={onProIntervalChange}
              status={{
                isCurrent: selectedProPlan.id === activePlanId && isSubscribed,
                hasActiveSubscription,
                isLoadingEstimate: pendingPlanId === selectedProPlan.id && isEstimateLoading,
                isOnTeamPlan,
              }}
              cancelDate={cancelDate}
              activePlanId={activePlanId}
              changePlan={changePlan}
              checkout={checkout}
              onChangePlanClick={onChangePlanClick}
              onCheckout={onCheckout}
            />
          )}

          {selectedMaxPlan && (
            <PlanCard
              plan={selectedMaxPlan}
              monthlyPlan={maxMonthly}
              interval={maxInterval}
              onIntervalChange={onMaxIntervalChange}
              status={{
                isCurrent: selectedMaxPlan.id === activePlanId && isSubscribed,
                hasActiveSubscription,
                isLoadingEstimate: pendingPlanId === selectedMaxPlan.id && isEstimateLoading,
                isOnTeamPlan,
              }}
              cancelDate={cancelDate}
              activePlanId={activePlanId}
              changePlan={changePlan}
              checkout={checkout}
              onChangePlanClick={onChangePlanClick}
              onCheckout={onCheckout}
            />
          )}
        </div>

        {proLifetime && (
          <div>
            <PlanCard
              plan={proLifetime}
              status={{
                isCurrent: proLifetime.id === activePlanId && isSubscribed,
                hasActiveSubscription,
                isLoadingEstimate: pendingPlanId === proLifetime.id && isEstimateLoading,
                isOnTeamPlan,
              }}
              cancelDate={cancelDate}
              activePlanId={activePlanId}
              changePlan={changePlan}
              checkout={checkout}
              onChangePlanClick={onChangePlanClick}
              onCheckout={onCheckout}
            />
          </div>
        )}
      </div>

      <Card
        className={cn(
          "border-border/80",
          isOnTeamPlan && "border-foreground ring-1 ring-foreground/10",
        )}
      >
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">{t("Teams")}</CardTitle>
              {isOnTeamPlan && (
                <Badge variant="secondary" className="text-xs">
                  {t("Current plan")}
                </Badge>
              )}
            </div>
            <CardDescription>
              {t("Give your whole team Pro or Max access with per-seat pricing.")}
            </CardDescription>
          </div>
          <Button size="sm" render={<Link href="/settings/team" />} nativeButton={false}>
            {t("Manage Team")}
          </Button>
        </CardHeader>
        <CardContent>
          <PlanHighlights
            items={[
              t("Pro or Max benefits for every team member"),
              t("Per-seat billing — pay only for active members"),
              t("Centralized billing and member management"),
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
