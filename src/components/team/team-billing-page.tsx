"use client";

import { useExtracted } from "next-intl";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { useBillingReceiptCopy } from "@/components/billing/billing-utils";
import { SubscriptionShredder } from "@/components/billing/subscription-shredder";
import type { SubscriptionReceiptData } from "@/components/billing/subscription-receipt";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamBillingCard } from "./team-billing-card";
import { TeamMaxModeCard } from "./team-max-mode-card";
import { useTeamSettingsContext } from "./team-settings-context";

export function TeamBillingPage() {
  const t = useExtracted();
  const { features } = usePlatformCapabilities();
  const getReceiptCopy = useBillingReceiptCopy();
  const {
    isOwner,
    isAdmin,
    activeOrg,
    teamBillingQuery,
    teamMaxModeQuery,
    teamPlans,
    createTeamCheckout,
    changeTeamPlan,
    cancelSub,
    resumeSub,
    updateTeamMaxMode,
    updateTeamMaxModeDefaultPolicy,
    updateMemberMaxModePolicy,
    handleSubscribe,
    handleChangePlan,
    handleManage,
    handleCancel,
    confirmCancel,
    shredOpen,
    setShredOpen,
    handleResume,
    handleTeamMaxModeToggle,
    updateMemberPolicy,
    updateDefaultPolicy,
    handleDefaultLimitChange,
    handleMemberLimitChange,
    handleExportMaxModeCsv,
  } = useTeamSettingsContext();

  const teamPlanId = teamBillingQuery.data?.planId ?? "pro_team_monthly";
  const teamPlan = teamPlans.find((plan) => plan.id === teamPlanId) ?? teamPlans[0];

  if (!features.billing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Billing unavailable")}</CardTitle>
          <CardDescription>
            {t("Plans, checkout, and billing management are turned off.")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Billing")}</CardTitle>
          <CardDescription>{t("Only team owners and admins can manage billing.")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TeamBillingCard
        isOwner={isOwner}
        isLoading={teamBillingQuery.isLoading}
        billingStatus={teamBillingQuery.data}
        plans={teamPlans}
        checkoutPending={createTeamCheckout.isPending}
        checkoutPlanId={createTeamCheckout.variables?.planId}
        changePending={changeTeamPlan.isPending}
        changePlanId={changeTeamPlan.variables?.planId}
        cancelPending={cancelSub.isPending || shredOpen}
        resumePending={resumeSub.isPending}
        onSubscribe={handleSubscribe}
        onChangePlan={handleChangePlan}
        onManage={handleManage}
        onCancel={handleCancel}
        onResume={handleResume}
      />

      <TeamMaxModeCard
        isLoading={teamMaxModeQuery.isLoading}
        settings={teamMaxModeQuery.data}
        teamTogglePending={updateTeamMaxMode.isPending}
        defaultPolicyPending={updateTeamMaxModeDefaultPolicy.isPending}
        memberPolicyPending={updateMemberMaxModePolicy.isPending}
        onTeamToggle={handleTeamMaxModeToggle}
        onDefaultPolicyChange={updateDefaultPolicy}
        onDefaultLimitChange={handleDefaultLimitChange}
        onMemberPolicyChange={updateMemberPolicy}
        onMemberLimitChange={handleMemberLimitChange}
        onExportCsv={handleExportMaxModeCsv}
      />

      <SubscriptionShredder
        data={
          {
            sessionId: activeOrg?.id ?? "team-cancel",
            ...getReceiptCopy(teamPlanId, "/settings/team", t("Home")),
            amountTotal: teamPlan?.amount ?? 0,
            amountSubtotal: teamPlan?.amount ?? null,
            amountTax: null,
            amountDiscount: null,
            currency: teamPlan?.currency ?? "usd",
            paymentMethodBrand: null,
            paymentMethodLast4: null,
            paidAt: teamBillingQuery.data?.currentPeriodEnd ?? null,
          } satisfies SubscriptionReceiptData
        }
        onClose={() => setShredOpen(false)}
        onConfirm={confirmCancel}
        open={shredOpen}
      />
    </div>
  );
}
