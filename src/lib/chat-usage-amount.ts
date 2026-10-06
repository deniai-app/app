import { getEffectiveTokenMultiplier, type EffectiveTokenMultiplierOptions } from "@/lib/constants";
import { computeWeightedUsageFromLanguageModelUsage } from "@/lib/token-weighting";

type ModelUsage = Parameters<typeof computeWeightedUsageFromLanguageModelUsage>[0];

/** Apply request pricing before adding steps; aggregate input is not a context size. */
export function calculateChatUsageAmount(
  modelId: string,
  usage: ModelUsage,
  options?: EffectiveTokenMultiplierOptions,
): number {
  const { weighted, breakdown } = computeWeightedUsageFromLanguageModelUsage(usage);
  const inputTokens = breakdown
    ? breakdown.input + breakdown.cacheRead + breakdown.cacheWrite
    : typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)
      ? Math.max(0, usage.inputTokens)
      : 0;
  return Math.ceil(weighted * getEffectiveTokenMultiplier(modelId, inputTokens, options));
}

/** Providers without step usage can still report their final rolled-up usage. */
export function resolveFinalChatUsageAmount(
  stepAmount: number,
  modelId: string,
  totalUsage: ModelUsage,
  options?: EffectiveTokenMultiplierOptions,
): number {
  return stepAmount === 0 ? calculateChatUsageAmount(modelId, totalUsage, options) : stepAmount;
}
