import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { toast } from "sonner";
import type { ModelOption } from "@/components/chat/chat-composer";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { trpc } from "@/lib/trpc/react";
import { liveUsageQueryOptions } from "@/lib/usage-query-options";

export function useUsageStatus(params: {
  model: string;
  availableModels: ModelOption[];
  /** When true on a Pro-capable model, usage is billed as premium. */
  proMode?: boolean;
}) {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const { model, availableModels, proMode = false } = params;
  const { features } = usePlatformCapabilities();

  const usageQuery = trpc.billing.usage.useQuery(undefined, {
    ...liveUsageQueryOptions,
  });

  const selectedModel = availableModels.find((m) => m.value === model);
  const usesProMode = Boolean(proMode && selectedModel?.supportsProMode);
  const usageCategory =
    selectedModel?.premium || usesProMode ? ("premium" as const) : ("basic" as const);
  const categoryUsage = usageQuery.data?.usage.find((usage) => usage.category === usageCategory);
  const remainingUsage = categoryUsage?.remaining;
  const usageLimit = categoryUsage?.limit;
  const usageUnit = categoryUsage?.unit ?? "requests";
  const usageTier = usageQuery.data?.tier ?? "free";
  const isSignupLimited = usageQuery.data?.signupLimited ?? false;

  const remaining = remainingUsage;
  const limit = usageLimit;
  const lowUsageThreshold =
    remaining == null || limit == null ? null : Math.max(3, Math.min(20, Math.ceil(limit * 0.1)));

  const maxModeEnabled = features.billing && (usageQuery.data?.maxModeEnabled ?? false);
  const isUsageLow =
    !maxModeEnabled &&
    remainingUsage !== null &&
    remainingUsage !== undefined &&
    usageLimit !== null &&
    usageLimit !== undefined &&
    lowUsageThreshold !== null &&
    remainingUsage > 0 &&
    remainingUsage <= lowUsageThreshold;
  const isUsageBlocked =
    !maxModeEnabled &&
    remainingUsage !== null &&
    remainingUsage !== undefined &&
    remainingUsage <= 0;
  const usageCategoryLabel = usageCategory === "premium" ? t("Premium") : t("Basic");
  const usageTierLabel =
    usageTier === "free"
      ? t("Free")
      : usageTier === "plus"
        ? t("Plus")
        : usageTier === "max"
          ? t("Max")
          : t("Pro");
  const usageUnitLabel = usageUnit === "tokens" ? t("tokens") : t("requests");
  const maxModeEligible = features.billing && (usageQuery.data?.maxModeEligible ?? false);
  const canEnableMaxMode = features.billing && maxModeEligible && !maxModeEnabled && isUsageBlocked;
  const isSubmitBlocked = !selectedModel || (isUsageBlocked && !maxModeEnabled);

  const utils = trpc.useUtils();
  const enableMaxMode = trpc.billing.enableMaxMode.useMutation({
    onSuccess: async () => {
      toast.success(t("Max Mode enabled."));
      await Promise.all([
        usageQuery.refetch(),
        utils.billing.maxModeStatus.invalidate(),
        utils.billing.usage.invalidate(),
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  return {
    usageQuery,
    selectedModel,
    usageTier,
    isSignupLimited,
    isUsageLow,
    isUsageBlocked,
    canEnableMaxMode,
    isSubmitBlocked,
    usageCategoryLabel,
    usageTierLabel,
    remainingUsage,
    usageUnit,
    usageUnitLabel,
    enableMaxMode,
  };
}
