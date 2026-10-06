/**
 * Cost-weighted token accounting.
 *
 * Quota consumption used to sum raw token counts equally, which dramatically
 * overcharged cache reads (~1/10 actual cost) and undercharged output tokens
 * (~5× actual cost). This helper applies per-component weights so that quota
 * usage tracks real provider cost.
 *
 * weighted = ceil(
 *   input        × FLIXA_USAGE_WEIGHT_INPUT       (default 1)
 * + cache_read   × FLIXA_USAGE_WEIGHT_CACHE_READ  (default 0.1)
 * + cache_write  × FLIXA_USAGE_WEIGHT_CACHE_WRITE (default 1.25)
 * + output       × FLIXA_USAGE_WEIGHT_OUTPUT      (default 5)
 * )
 *
 * Caller multiplies by the model-specific `tokenUsageMultiplier`.
 */

import { env } from "@/env";

export type TokenUsageBreakdown = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
};

export type TokenUsageWeights = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
};

const DEFAULT_WEIGHTS: TokenUsageWeights = {
  input: 1,
  cacheRead: 0.1,
  cacheWrite: 1.25,
  output: 5,
};

function parseWeight(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getTokenUsageWeights(): TokenUsageWeights {
  return {
    input: parseWeight(env.FLIXA_USAGE_WEIGHT_INPUT, DEFAULT_WEIGHTS.input),
    cacheRead: parseWeight(env.FLIXA_USAGE_WEIGHT_CACHE_READ, DEFAULT_WEIGHTS.cacheRead),
    cacheWrite: parseWeight(env.FLIXA_USAGE_WEIGHT_CACHE_WRITE, DEFAULT_WEIGHTS.cacheWrite),
    output: parseWeight(env.FLIXA_USAGE_WEIGHT_OUTPUT, DEFAULT_WEIGHTS.output),
  };
}

function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * AI SDK `LanguageModelUsage` shape: already normalized across providers. Uses
 * the broken-out `inputTokenDetails` when available; otherwise falls back to
 * `inputTokens` as raw input with no cache breakdown.
 */
export function breakdownFromLanguageModelUsage(usage: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputTokenDetails?: {
    noCacheTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
  } | null;
}): TokenUsageBreakdown {
  const details = usage.inputTokenDetails;
  const hasDetails =
    details &&
    (details.noCacheTokens != null ||
      details.cacheReadTokens != null ||
      details.cacheWriteTokens != null);

  if (hasDetails) {
    return {
      input: nonNegative(details?.noCacheTokens),
      cacheRead: nonNegative(details?.cacheReadTokens),
      cacheWrite: nonNegative(details?.cacheWriteTokens),
      output: nonNegative(usage.outputTokens),
    };
  }

  return {
    input: nonNegative(usage.inputTokens),
    cacheRead: 0,
    cacheWrite: 0,
    output: nonNegative(usage.outputTokens),
  };
}

export function computeWeightedTokens(
  breakdown: TokenUsageBreakdown,
  weights: TokenUsageWeights = getTokenUsageWeights(),
): number {
  return Math.ceil(
    breakdown.input * weights.input +
      breakdown.cacheRead * weights.cacheRead +
      breakdown.cacheWrite * weights.cacheWrite +
      breakdown.output * weights.output,
  );
}

/**
 * Top-level entry point used by the chat route. Prefers the broken-out
 * input/output detail; otherwise falls back to `total_tokens` (un-weighted) to
 * avoid charging zero when a provider returns only the rolled-up count.
 */
export function computeWeightedUsageFromLanguageModelUsage(usage: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  inputTokenDetails?: {
    noCacheTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
  } | null;
}): { weighted: number; breakdown: TokenUsageBreakdown | null } {
  const hasAnyDetail =
    usage.inputTokens != null ||
    usage.outputTokens != null ||
    usage.inputTokenDetails?.noCacheTokens != null ||
    usage.inputTokenDetails?.cacheReadTokens != null ||
    usage.inputTokenDetails?.cacheWriteTokens != null;

  if (hasAnyDetail) {
    const breakdown = breakdownFromLanguageModelUsage(usage);
    return { weighted: computeWeightedTokens(breakdown), breakdown };
  }

  return { weighted: nonNegative(usage.totalTokens), breakdown: null };
}
