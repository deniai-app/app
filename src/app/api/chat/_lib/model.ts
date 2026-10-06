import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiResponsesProviderOptions } from "@ai-sdk/xai";
import type { LanguageModel, ModelMessage, SystemModelMessage } from "ai";
import { streamText } from "ai";
import { env } from "@/env";
import {
  isGuestModel,
  isModelAllowedForAccount,
  isProModeAllowedForAccount,
  models,
  resolveReasoningEffort,
} from "@/lib/constants";
import { createDeniOpenRouter } from "@/lib/openrouter-provider";
import { isModelProviderAvailable } from "@/lib/platform-capabilities";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import { getUsageSummary, type UsageCategory, UsageLimitError } from "@/lib/usage";

const openaiEffortOptions = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const googleThinkingLevels = ["minimal", "low", "medium", "high"] as const;

export class ChatRouteError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "Chat route error");
    this.status = status;
    this.body = body;
  }
}

const OPENROUTER_CACHE_CONTROL = {
  type: "ephemeral",
  ttl: "1h",
} as const;

const MAX_CACHED_MESSAGES = 2;

type ResolveChatModelContextParams = {
  userId: string;
  isAnonymous: boolean;
  baseModel: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  /** OpenAI Pro model mode, routed through OpenRouter's Pro model alias. */
  proMode?: boolean;
  /** OpenAI Fast mode (`service_tier: "fast"`). */
  fastMode?: boolean;
};

type ChatProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;

type ResolvedChatModelContext = {
  model: LanguageModel;
  usesOpenRouter: boolean;
  usageCategory: UsageCategory;
  usageUnit: "requests" | "tokens";
  providerOptions: ChatProviderOptions;
};

function mergeProviderOptions(
  existing: ChatProviderOptions | undefined,
  additions: ChatProviderOptions,
): ChatProviderOptions {
  return {
    ...existing,
    ...additions,
  };
}

export function addOpenRouterCacheControl(
  messages: ModelMessage[],
  system: string,
): { messages: ModelMessage[]; system: SystemModelMessage } {
  const cacheProviderOptions = {
    openrouter: {
      cacheControl: OPENROUTER_CACHE_CONTROL,
    },
  } satisfies ChatProviderOptions;

  // Anthropic allows at most 4 cache breakpoints per request: one on the system
  // prompt plus the trailing messages, with the last text part of each.
  const firstCachedIndex = messages.length - MAX_CACHED_MESSAGES;

  return {
    system: {
      role: "system",
      content: system,
      providerOptions: cacheProviderOptions,
    },
    messages: messages.map((message, index) => {
      if (index < firstCachedIndex) {
        return message;
      }

      if (typeof message.content === "string") {
        return {
          ...message,
          providerOptions: mergeProviderOptions(message.providerOptions, cacheProviderOptions),
        } as ModelMessage;
      }

      const lastTextIndex = message.content.findLastIndex((part) => part.type === "text");
      if (lastTextIndex === -1) {
        return message;
      }

      return {
        ...message,
        content: message.content.map((part, partIndex) =>
          partIndex === lastTextIndex && part.type === "text"
            ? {
                ...part,
                providerOptions: mergeProviderOptions(part.providerOptions, cacheProviderOptions),
              }
            : part,
        ),
      } as ModelMessage;
    }),
  };
}

export async function resolveChatModelContext({
  userId,
  isAnonymous,
  baseModel,
  reasoningEffort,
  proMode = false,
  fastMode = false,
}: ResolveChatModelContextParams): Promise<ResolvedChatModelContext> {
  const selectedModel = models.find((model) => model.value === baseModel);

  if (!selectedModel) {
    throw new ChatRouteError(400, { error: "Unknown model" });
  }

  if (isAnonymous && !isGuestModel(selectedModel.value)) {
    throw new ChatRouteError(403, {
      error: "Only GPT-6 Luna is available for guest sessions.",
    });
  }

  let usageUnit: "requests" | "tokens" = "requests";
  const providerId = selectedModel.provider ?? selectedModel.author;
  const deniApiKey = env.DENI_API_KEY?.trim();
  const deniApiBaseUrl = env.DENI_API_BASE_URL;

  if (!providerId) {
    throw new ChatRouteError(400, { error: "Unknown provider" });
  }

  if (!isModelProviderAvailable(platformCapabilities, providerId)) {
    throw new ChatRouteError(503, {
      error: "This model is not configured in the current environment.",
    });
  }

  // Everything except the Deni AI API provider is routed through OpenRouter.
  const usesOpenRouter = providerId !== "deni";
  // OpenRouter exposes Pro models through `*-pro` slugs and supports Fast via
  // top-level service_tier.
  const useProMode = Boolean(
    proMode && selectedModel.supportsProMode && providerId === "openai" && usesOpenRouter,
  );
  const useFastMode = Boolean(
    fastMode && selectedModel.supportsFastMode && providerId === "openai" && usesOpenRouter,
  );
  const isPremiumModel = Boolean(selectedModel.premium);
  // Pro mode always bills against premium quota (even when the base model is basic).
  const usageCategory: UsageCategory = isPremiumModel || useProMode ? "premium" : "basic";
  // Guests stay on the guest allowlist; verified free accounts unlock the full catalog.
  // All model requests count toward platform usage.
  try {
    const usageSummary = await getUsageSummary({ userId, isAnonymous });

    if (
      !isAnonymous &&
      !isModelAllowedForAccount(
        selectedModel.value,
        usageSummary.tier,
        usageSummary.hasVerifiedPaymentMethod,
      )
    ) {
      throw new ChatRouteError(403, {
        error: "This model is not available on the Free plan. Upgrade to Plus or higher to use it.",
      });
    }

    if (!isAnonymous && useProMode && !isProModeAllowedForAccount(usageSummary.tier)) {
      throw new ChatRouteError(403, {
        error: "Pro mode is not available on the Free plan. Upgrade to Plus or higher to use it.",
      });
    }

    if (isAnonymous && usageCategory === "premium") {
      throw new ChatRouteError(403, {
        error: useProMode
          ? "Pro mode is not available for guest sessions."
          : "Premium models are not available for guest sessions.",
      });
    }

    const categoryUsage = usageSummary.usage.find((usage) => usage.category === usageCategory);
    usageUnit = categoryUsage?.unit ?? "requests";
    const isLimitReached =
      categoryUsage?.remaining !== null &&
      categoryUsage?.remaining !== undefined &&
      categoryUsage.remaining <= 0;

    if (isLimitReached && !usageSummary.maxModeEnabled) {
      throw new UsageLimitError(
        "You've hit the usage limit for your plan.",
        usageSummary.maxModeEligible,
      );
    }
  } catch (error) {
    if (error instanceof ChatRouteError) {
      throw error;
    }
    if (error instanceof UsageLimitError) {
      throw new ChatRouteError(402, {
        error: error.message,
        reason: "usage_limit",
      });
    }

    console.error("Failed to check usage", error);
    throw new ChatRouteError(500, { error: "Unable to check usage" });
  }

  // OpenRouter exposes GPT-5.6 and GPT-6 Pro as `*-pro`.
  const resolvedModelId =
    useProMode && usesOpenRouter ? `${selectedModel.value}-pro` : selectedModel.value;

  const resolvedReasoningEffort = resolveReasoningEffort(
    selectedModel?.efforts ?? false,
    reasoningEffort,
  );
  const openaiReasoningEffort =
    (providerId === "openai" || providerId === "deni") &&
    resolvedReasoningEffort &&
    openaiEffortOptions.includes(resolvedReasoningEffort as (typeof openaiEffortOptions)[number])
      ? (resolvedReasoningEffort as (typeof openaiEffortOptions)[number])
      : undefined;
  const googleThinkingLevel =
    providerId === "google" &&
    resolvedReasoningEffort &&
    googleThinkingLevels.includes(resolvedReasoningEffort as (typeof googleThinkingLevels)[number])
      ? (resolvedReasoningEffort as (typeof googleThinkingLevels)[number])
      : undefined;
  const xaiReasoningEffort =
    providerId === "xai" &&
    (resolvedReasoningEffort === "low" || resolvedReasoningEffort === "high")
      ? resolvedReasoningEffort
      : undefined;

  // OpenRouter uses `x-ai/...` for xAI models (not `xai/...`).
  const openRouterAuthor = selectedModel.author === "xai" ? "x-ai" : selectedModel.author;
  const selectedOpenRouterModelId = selectedModel
    ? resolvedModelId.includes("/")
      ? resolvedModelId
      : `${openRouterAuthor}/${resolvedModelId}`
    : null;
  const getOpenRouterModel = () => {
    if (!selectedOpenRouterModelId) {
      throw new Error("OpenRouter model is not available for the selected model.");
    }
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new ChatRouteError(503, {
        error: "OpenRouter is not configured in the current environment.",
      });
    }

    const openrouter = createDeniOpenRouter({
      apiKey,
    });

    return openrouter.chat(selectedOpenRouterModelId, {
      provider: {
        allow_fallbacks: false,
        only: ["openai", "anthropic", "google-ai-studio", "xai", "groq"],
      },
    });
  };
  const getDeniModel = () => {
    if (!deniApiKey || !deniApiBaseUrl) {
      throw new ChatRouteError(503, {
        error: "Deni AI API is not configured in the current environment.",
      });
    }

    const provider = createOpenAI({
      apiKey: deniApiKey,
      baseURL: deniApiBaseUrl,
    });
    return provider.chat(resolvedModelId);
  };

  let model: LanguageModel;
  switch (providerId) {
    case "openai":
    case "anthropic":
    case "google":
    case "xai": {
      model = getOpenRouterModel();
      break;
    }
    case "deni": {
      model = getDeniModel();
      break;
    }
    default:
      throw new ChatRouteError(400, { error: "Unknown provider" });
  }

  const openaiProviderOptions: OpenAIResponsesProviderOptions | undefined = openaiReasoningEffort
    ? {
        reasoningEffort: openaiReasoningEffort,
        reasoningSummary: "detailed",
      }
    : undefined;

  const directProviderOptions = {
    ...(openaiProviderOptions
      ? {
          openai: openaiProviderOptions,
        }
      : {}),
    ...(googleThinkingLevel
      ? {
          google: {
            thinkingConfig: {
              thinkingLevel: googleThinkingLevel,
              includeThoughts: true,
            },
          },
        }
      : {}),
    ...(xaiReasoningEffort
      ? {
          xai: {
            reasoningEffort: xaiReasoningEffort,
          } satisfies XaiResponsesProviderOptions,
        }
      : {}),
  };

  // When routing through OpenRouter, wrap provider-specific options so they are
  // forwarded in OpenRouter-compatible format.
  const openRouterBody = usesOpenRouter
    ? {
        ...(Object.keys(directProviderOptions).length > 0
          ? { providerOptions: directProviderOptions }
          : {}),
        ...(useFastMode ? { service_tier: "fast" as const } : {}),
      }
    : undefined;
  const providerOptions: ChatProviderOptions = (
    !usesOpenRouter
      ? directProviderOptions
      : openRouterBody && Object.keys(openRouterBody).length > 0
        ? { openrouter: openRouterBody }
        : {}
  ) as ChatProviderOptions;

  return {
    model,
    usesOpenRouter,
    usageCategory,
    usageUnit,
    providerOptions,
  };
}
