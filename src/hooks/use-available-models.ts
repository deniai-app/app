import { useMemo } from "react";
import type { ModelOption } from "@/components/chat/chat-composer";
import { authClient } from "@/lib/auth-client";
import {
  getModelsForGuest,
  getModelsForPlanTier,
  isProModeAllowedForAccount,
} from "@/lib/constants";
import { isModelProviderAvailable } from "@/lib/platform-capabilities";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { trpc } from "@/lib/trpc/react";
import { liveUsageQueryOptions } from "@/lib/usage-query-options";

export function useAvailableModels() {
  const session = authClient.useSession();
  const isAnonymous = Boolean(session.data?.user?.isAnonymous);
  const platformCapabilities = usePlatformCapabilities();

  // Default to free until tier is known so free users never briefly see paid models.
  // Share options with useUsageStatus so both hooks hit the same cached query.
  const usageQuery = trpc.billing.usage.useQuery(undefined, {
    ...liveUsageQueryOptions,
    enabled: Boolean(session.data?.user) && !isAnonymous,
  });
  const planTier = isAnonymous ? "free" : (usageQuery.data?.tier ?? "free");
  const hasVerifiedPaymentMethod =
    !isAnonymous && Boolean(usageQuery.data?.hasVerifiedPaymentMethod);

  const availableModels = useMemo<ModelOption[]>(() => {
    const planModels = isAnonymous
      ? getModelsForGuest()
      : getModelsForPlanTier(planTier, hasVerifiedPaymentMethod);
    const proModeAllowed = !isAnonymous && isProModeAllowedForAccount(planTier);
    return planModels
      .filter((model) => {
        const provider = model.provider ?? model.author;
        return isModelProviderAvailable(platformCapabilities, provider);
      })
      .map((model) =>
        model.supportsProMode && !proModeAllowed ? { ...model, supportsProMode: false } : model,
      );
  }, [hasVerifiedPaymentMethod, isAnonymous, planTier, platformCapabilities]);

  return {
    availableModels,
    isAnonymous,
    planTier,
    // Do not load ad SDKs until the viewer's free tier is confirmed.
    canShowAds: Boolean(session.data?.user) && (isAnonymous || usageQuery.data?.tier === "free"),
    platformCapabilities,
    shouldVerifyCard:
      platformCapabilities.features.billing &&
      Boolean(session.data?.user) &&
      !isAnonymous &&
      usageQuery.data?.tier === "free" &&
      usageQuery.data.hasVerifiedPaymentMethod === false,
  };
}
