"use client";

import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { startTransition, useState } from "react";
import { toast } from "sonner";
import type { BillingPlanId, ClientPlan, IndividualPlanId } from "@/lib/billing";
import { isIndividualPlanId, isTeamPlan } from "@/lib/billing";
import { trpc } from "@/lib/trpc/react";
import { settingsUsageQueryOptions } from "@/lib/usage-query-options";
import { ACTIVE_STATUSES, useBillingReceiptCopy } from "./billing-utils";
import type { SubscriptionReceiptData } from "./subscription-receipt-data";

export function useBillingPage() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const { push } = useRouter();
  const [changeTarget, setChangeTarget] = useState<ClientPlan | null>(null);
  const [plusInterval, setPlusInterval] = useState<"monthly" | "yearly">("monthly");
  const [proInterval, setProInterval] = useState<"monthly" | "yearly">("monthly");
  const [maxInterval, setMaxInterval] = useState<"monthly" | "yearly">("monthly");
  const [hasAgreed, setHasAgreed] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<IndividualPlanId | null>(null);

  const estimateQuery = trpc.billing.estimatePlanChange.useQuery(
    { planId: pendingPlanId ?? "plus_monthly" },
    {
      enabled: Boolean(pendingPlanId),
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const isChangePlanOpen =
    pendingPlanId !== null &&
    !estimateQuery.isFetching &&
    (estimateQuery.data !== undefined || estimateQuery.error !== null);

  const handleChangePlanClick = (plan: ClientPlan) => {
    setChangeTarget(plan);
    if (isIndividualPlanId(plan.id)) {
      setPendingPlanId(plan.id);
    }
  };

  const createCheckout = trpc.billing.createCheckoutSession.useMutation();

  const handleCheckout = async (planId: IndividualPlanId) => {
    try {
      const result = await createCheckout.mutateAsync({ planId });
      startTransition(() => {
        push(`/settings/billing/checkout/${result.sessionId}`);
      });
    } catch (error) {
      toast.error(localizeError(error, t("Unable to load checkout.")));
    }
  };

  const utils = trpc.useUtils();
  const statusQuery = trpc.billing.status.useQuery(undefined, {
    staleTime: 60_000,
  });
  const plansQuery = trpc.billing.plans.useQuery();
  const usageQuery = trpc.billing.usage.useQuery(undefined, {
    ...settingsUsageQueryOptions,
  });

  const portal = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(t("Stripe did not return a billing portal URL."));
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const changePlan = trpc.billing.changePlan.useMutation({
    onSuccess: async () => {
      toast.success(t("Plan updated."));
      await utils.billing.status.invalidate();
      await utils.billing.maxModeStatus.invalidate();
      await utils.billing.usage.invalidate();
    },
    onError: (error) => toast.error(localizeError(error)),
    onSettled: () => {
      setChangeTarget(null);
      setPendingPlanId(null);
      setHasAgreed(false);
    },
  });

  const handleDialogOpenChange = (open: boolean) => {
    if (changePlan.isPending) return;
    if (!open) {
      setHasAgreed(false);
      setPendingPlanId(null);
      setChangeTarget(null);
    }
  };

  const handleConfirmChangePlan = (planId: IndividualPlanId) => {
    changePlan.mutate({ planId });
  };

  const [shredOpen, setShredOpen] = useState(false);
  const getReceiptCopy = useBillingReceiptCopy();

  const cancel = trpc.billing.cancelSubscription.useMutation({
    onSuccess: async () => {
      await utils.billing.status.invalidate();
      await utils.billing.maxModeStatus.invalidate();
      await utils.billing.usage.invalidate();
    },
  });

  const resume = trpc.billing.resumeSubscription.useMutation({
    onSuccess: async () => {
      toast.success(t("Subscription resumed."));
      await utils.billing.status.invalidate();
      await utils.billing.maxModeStatus.invalidate();
      await utils.billing.usage.invalidate();
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const maxModeQuery = trpc.billing.maxModeStatus.useQuery(undefined, {
    staleTime: 60_000,
  });

  const enableMaxMode = trpc.billing.enableMaxMode.useMutation({
    onSuccess: async () => {
      toast.success(t("Max Mode enabled."));
      await utils.billing.maxModeStatus.invalidate();
      await utils.billing.usage.invalidate();
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const disableMaxMode = trpc.billing.disableMaxMode.useMutation({
    onSuccess: async () => {
      toast.success(t("Max Mode disabled."));
      await utils.billing.maxModeStatus.invalidate();
      await utils.billing.usage.invalidate();
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const handleMaxModeToggle = (enabled: boolean) => {
    if (enabled) {
      if (statusQuery.data?.status !== "active" || !maxModeQuery.data?.eligible) return;
      enableMaxMode.mutate();
    } else {
      disableMaxMode.mutate();
    }
  };

  const statusLabel = statusQuery.data?.status ?? "inactive";
  const rawPlanId = (statusQuery.data?.planId as BillingPlanId) ?? undefined;
  const currentPeriodEnd = statusQuery.data?.currentPeriodEnd;
  const isSubscribed =
    ACTIVE_STATUSES.has(statusLabel) ||
    (statusLabel === "canceled" &&
      currentPeriodEnd != null &&
      new Date(currentPeriodEnd).getTime() > Date.now());
  const activePlanId = isSubscribed ? rawPlanId : undefined;
  const isOnTeamPlan =
    statusQuery.data?.isTeamPlan === true && rawPlanId ? isTeamPlan(rawPlanId) : false;
  const usage = usageQuery.data?.usage ?? [];
  const usageTier = usageQuery.data?.tier ?? "free";
  const usageTierLabel = (() => {
    switch (usageTier) {
      case "max":
        return t("Max");
      case "plus":
        return t("Plus");
      case "pro":
        return t("Pro");
      default:
        return t("Free");
    }
  })();

  const planMap = new Map((plansQuery.data?.plans ?? []).map((plan) => [plan.id, plan]));
  const currentPlan = activePlanId ? planMap.get(activePlanId) : undefined;
  const isSubscription = statusQuery.data?.mode === "subscription";
  const hasActiveSubscription = isSubscribed && isSubscription;
  const cancelAt = statusQuery.data?.cancelAt;
  const cancelDate = typeof cancelAt === "number" && isSubscription ? cancelAt : null;

  const loading = statusQuery.isLoading || plansQuery.isLoading;
  const errored = statusQuery.error ?? plansQuery.error;
  const allPlans = plansQuery.data?.plans ?? [];

  const plusMonthly = allPlans.find((p) => p.id === "plus_monthly");
  const plusYearly = allPlans.find((p) => p.id === "plus_yearly");
  const proMonthly = allPlans.find((p) => p.id === "pro_monthly");
  const proYearly = allPlans.find((p) => p.id === "pro_yearly");
  const maxMonthly = allPlans.find((p) => p.id === "max_monthly");
  const maxYearly = allPlans.find((p) => p.id === "max_yearly");
  const proLifetime = allPlans.find((p) => p.id === "pro_lifetime");

  const selectedPlusPlan = plusInterval === "monthly" ? plusMonthly : plusYearly;
  const selectedProPlan = proInterval === "monthly" ? proMonthly : proYearly;
  const selectedMaxPlan = maxInterval === "monthly" ? maxMonthly : maxYearly;
  const basicUsage = usage.find((entry) => entry.category === "basic");
  const premiumUsage = usage.find((entry) => entry.category === "premium");
  const cancelReceipt = {
    sessionId: statusQuery.data?.stripeCustomerId ?? activePlanId ?? "cancel",
    ...getReceiptCopy(activePlanId, "/settings/billing", t("Home")),
    amountTotal: currentPlan?.amount ?? 0,
    amountSubtotal: currentPlan?.amount ?? null,
    amountTax: null,
    amountDiscount: null,
    currency: currentPlan?.currency ?? "usd",
    paymentMethodBrand: null,
    paymentMethodLast4: null,
    paidAt: statusQuery.data?.currentPeriodEnd ?? null,
  } satisfies SubscriptionReceiptData;

  return {
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
    shredOpen,
    statusQuery,
    usageQuery,
    usageTier,
    usageTierLabel,
  };
}
