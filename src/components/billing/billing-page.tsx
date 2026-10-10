"use client";

import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { SettingsPageShell } from "../settings-page-shell";
import { CardVerificationCard } from "./card-verification-card";
import { BillingChangePlanDialog } from "./billing-change-plan-dialog";
import { BillingCurrentPlanCard } from "./billing-current-plan-card";
import { BillingFlashOfferBanner } from "./billing-flash-offer-banner";
import { BillingMaxModeCard } from "./billing-max-mode-card";
import { BillingPlansSection } from "./billing-plans-section";
import { BillingResetCard } from "./billing-reset-card";
import { BillingUsageSection } from "./billing-usage-section";
import { SubscriptionShredder } from "./subscription-shredder";
import { useBillingPage } from "./use-billing-page";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Spinner } from "../ui/spinner";

function BillingDisabled() {
  const t = useExtracted();

  return (
    <SettingsPageShell
      title={t("Billing")}
      description={t("Billing is disabled for this environment.")}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("Billing unavailable")}</CardTitle>
          <CardDescription>
            {t("Plans, checkout, and billing management are turned off.")}
          </CardDescription>
        </CardHeader>
      </Card>
    </SettingsPageShell>
  );
}

function BillingPageContent() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const {
    activePlanId,
    basicUsage,
    cancel,
    cancelDate,
    cancelReceipt,
    changePlan,
    changeTarget,
    createCheckout,
    currentPlan,
    disableMaxMode,
    enableMaxMode,
    estimateQuery,
    errored,
    flashOffer,
    handleChangePlanClick,
    handleCheckout,
    handleConfirmChangePlan,
    handleDialogOpenChange,
    handleMaxModeToggle,
    hasActiveSubscription,
    hasAgreed,
    isChangePlanOpen,
    isOnTeamPlan,
    isSubscribed,
    loading,
    maxInterval,
    maxModeQuery,
    maxMonthly,
    pendingPlanId,
    plusInterval,
    plusMonthly,
    portal,
    premiumUsage,
    proInterval,
    proLifetime,
    proMonthly,
    rawPlanId,
    resume,
    selectedMaxPlan,
    selectedPlusPlan,
    selectedProPlan,
    setHasAgreed,
    setMaxInterval,
    setPlusInterval,
    setProInterval,
    setShredOpen,
    showYearlyPlans,
    shredOpen,
    statusQuery,
    usageQuery,
    usageTier,
    usageTierLabel,
  } = useBillingPage();

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <SettingsPageShell
      title={t("Billing")}
      description={t("Manage your subscription and usage")}
      className="max-w-6xl"
    >
      {flashOffer && (
        <BillingFlashOfferBanner
          endsAt={flashOffer.endsAt}
          percentOff={flashOffer.percentOff}
          isUpTo={flashOffer.isUpTo}
          onViewOffer={showYearlyPlans}
        />
      )}

      <BillingCurrentPlanCard
        isOnTeamPlan={isOnTeamPlan}
        rawPlanId={rawPlanId}
        currentPlan={currentPlan}
        activePlanId={activePlanId}
        cancelDate={cancelDate}
        currentPeriodEnd={statusQuery.data?.currentPeriodEnd}
        stripeCustomerId={statusQuery.data?.stripeCustomerId}
        hasActiveSubscription={hasActiveSubscription}
        portalPending={portal.isPending}
        cancelPending={cancel.isPending || shredOpen}
        resumePending={resume.isPending}
        onPortal={() => portal.mutate()}
        onCancel={() => setShredOpen(true)}
        onResume={() => resume.mutate()}
      />

      <BillingUsageSection
        usageTierLabel={usageTierLabel}
        isLoading={usageQuery.isLoading}
        errorMessage={usageQuery.error ? localizeError(usageQuery.error) : undefined}
        basicUsage={basicUsage}
        premiumUsage={premiumUsage}
        maxModeEnabled={maxModeQuery.data?.enabled}
      />

      <CardVerificationCard
        isFreeTier={usageTier === "free"}
        hasVerifiedPaymentMethod={usageQuery.data?.hasVerifiedPaymentMethod ?? false}
        signupLimited={usageQuery.data?.signupLimited ?? false}
      />

      <BillingResetCard />

      {statusQuery.data?.status === "active" && maxModeQuery.data?.eligible && (
        <BillingMaxModeCard
          data={maxModeQuery.data}
          onToggle={handleMaxModeToggle}
          isToggling={enableMaxMode.isPending || disableMaxMode.isPending}
        />
      )}

      <BillingPlansSection
        erroredMessage={errored?.message}
        hasActiveSubscription={hasActiveSubscription}
        selectedPlusPlan={selectedPlusPlan}
        plusMonthly={plusMonthly}
        plusInterval={plusInterval}
        onPlusIntervalChange={setPlusInterval}
        selectedProPlan={selectedProPlan}
        proMonthly={proMonthly}
        proInterval={proInterval}
        onProIntervalChange={setProInterval}
        selectedMaxPlan={selectedMaxPlan}
        maxMonthly={maxMonthly}
        maxInterval={maxInterval}
        onMaxIntervalChange={setMaxInterval}
        proLifetime={proLifetime}
        isOnTeamPlan={isOnTeamPlan}
        planActions={{
          activePlanId,
          isSubscribed,
          hasActiveSubscription,
          isOnTeamPlan,
          pendingPlanId,
          isEstimateLoading: estimateQuery.isLoading,
          cancelDate,
          changePlan,
          checkout: createCheckout,
          onChangePlanClick: handleChangePlanClick,
          onCheckout: handleCheckout,
        }}
      />

      <BillingChangePlanDialog
        open={isChangePlanOpen}
        onOpenChange={handleDialogOpenChange}
        changeTarget={changeTarget}
        estimate={estimateQuery}
        hasAgreed={hasAgreed}
        onHasAgreedChange={setHasAgreed}
        isPending={changePlan.isPending}
        onConfirm={handleConfirmChangePlan}
      />

      <SubscriptionShredder
        data={cancelReceipt}
        onClose={() => setShredOpen(false)}
        onConfirm={async () => {
          await cancel.mutateAsync();
        }}
        open={shredOpen}
      />
    </SettingsPageShell>
  );
}

export function BillingPage() {
  const { features } = usePlatformCapabilities();

  if (!features.billing) {
    return <BillingDisabled />;
  }

  return <BillingPageContent />;
}
