import { type AnthropicProviderOptions, createAnthropic } from "@ai-sdk/anthropic";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiResponsesProviderOptions } from "@ai-sdk/xai";
import type { LanguageModel, ModelMessage, SystemModelMessage } from "ai";
import { streamText } from "ai";
import { env } from "@/env";
import {
  isGuestModel,
  isModelAllowedForAccount,
  models,
  resolveReasoningEffort,
} from "@/lib/constants";
import { createDeniOpenRouter } from "@/lib/openrouter-provider";
import { isModelProviderAvailable } from "@/lib/platform-capabilities";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import { getUsageSummary, type UsageCategory, UsageLimitError } from "@/lib/usage";

const DEFAULT_VOIDS_BASE_URL = "https://capi.voids.top/v2";

const openaiEffortOptions = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const anthropicEffortOptions = ["low", "medium", "high", "max"] as const;
const googleThinkingLevels = ["minimal", "low", "medium", "high"] as const;
const anthropicBudgetModelIds = new Set(["claude-opus-4.1", "claude-opus-4", "claude-sonnet-4"]);

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

  return {
    system: {
      role: "system",
      content: system,
      providerOptions: cacheProviderOptions,
    },
    messages: messages.map((message) => {
      if (typeof message.content === "string") {
        return {
          ...message,
          providerOptions: mergeProviderOptions(message.providerOptions, cacheProviderOptions),
        } as ModelMessage;
      }

      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "text"
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
      error: "Only GPT-5.6 Luna is available for guest sessions.",
    });
  }

  let usageUnit: "requests" | "tokens" = "requests";
  const providerId = selectedModel.provider ?? selectedModel.author;
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  const groqApiKey = env.GROQ_API_KEY?.trim();
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

  // voids.top is opt-in via VOIDS_MODE plus VOIDS_API_KEY. When both are
  // enabled, OpenAI + Anthropic traffic uses the gateway. Otherwise OpenAI/xAI
  // use OpenRouter, while Anthropic prefers its native platform key.
  const voidsModeEnabled = Boolean(env.VOIDS_MODE);
  const voidsKeyConfigured = Boolean(env.VOIDS_API_KEY?.trim());
  const usesVoids =
    voidsModeEnabled &&
    voidsKeyConfigured &&
    (providerId === "openai" || providerId === "anthropic");
  const usesOpenRouter =
    !usesVoids &&
    (providerId === "openai" ||
      providerId === "google" ||
      providerId === "xai" ||
      (providerId === "anthropic" && !anthropicApiKey));
  // OpenRouter exposes Pro models through `*-pro` slugs and supports Fast via
  // top-level service_tier. voids.top does not support either option.
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

  // OpenRouter exposes GPT-5.6 and GPT-6 Pro as `*-pro`. voids.top does not — keep base id there.
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
  // Anthropic-native options only apply when using its direct platform SDK.
  // voids.top is OpenAI-compatible and does not accept Anthropic providerOptions.
  const anthropicReasoningEffort =
    providerId === "anthropic" &&
    !usesVoids &&
    !usesOpenRouter &&
    !anthropicBudgetModelIds.has(selectedModel?.value ?? "") &&
    resolvedReasoningEffort &&
    anthropicEffortOptions.includes(
      resolvedReasoningEffort as (typeof anthropicEffortOptions)[number],
    )
      ? (resolvedReasoningEffort as (typeof anthropicEffortOptions)[number])
      : undefined;
  const anthropicThinkingBudget =
    providerId === "anthropic" &&
    !usesVoids &&
    !usesOpenRouter &&
    anthropicBudgetModelIds.has(selectedModel?.value ?? "") &&
    resolvedReasoningEffort
      ? resolvedReasoningEffort === "low"
        ? 5_000
        : resolvedReasoningEffort === "medium"
          ? 10_000
          : resolvedReasoningEffort === "high"
            ? 15_000
            : undefined
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
        only: ["openai", "anthropic", "google-ai-studio", "xai"],
      },
    });
  };
  const getAnthropicModel = (apiKey: string | undefined, baseURL?: string) => {
    if (!apiKey?.trim()) {
      throw new ChatRouteError(503, {
        error: "Anthropic is not configured in the current environment.",
      });
    }

    const provider = createAnthropic({
      apiKey,
      baseURL,
    });

    return provider(resolvedModelId.replace(".", "-"));
  };
  const getVoidsModel = () => {
    const apiKey = env.VOIDS_API_KEY?.trim();
    if (!apiKey) {
      throw new ChatRouteError(500, {
        error:
          "VOIDS_API_KEY is required when VOIDS_MODE is enabled. Set a valid voids.top API key in the environment.",
      });
    }

    const provider = createOpenAI({
      apiKey,
      baseURL: env.VOIDS_BASE_URL || DEFAULT_VOIDS_BASE_URL,
      name: "voids",
    });
    // voids.top speaks the Chat Completions API with OpenAI-style model ids
    // (e.g. gpt-5.6-sol, claude-fable-5.1). Keep the id as declared in constants.
    return provider.chat(resolvedModelId);
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

  const anthropicOptions: AnthropicProviderOptions = {};
  if (anthropicReasoningEffort) {
    anthropicOptions.effort = anthropicReasoningEffort;
  }
  if (anthropicThinkingBudget) {
    anthropicOptions.thinking = {
      type: "enabled",
      budgetTokens: anthropicThinkingBudget,
    };
  }

  let model: LanguageModel;
  switch (providerId) {
    case "openai": {
      model = usesVoids ? getVoidsModel() : getOpenRouterModel();
      break;
    }
    case "anthropic": {
      if (usesVoids) {
        model = getVoidsModel();
      } else if (anthropicApiKey) {
        model = getAnthropicModel(anthropicApiKey);
      } else {
        model = getOpenRouterModel();
      }
      break;
    }
    case "google": {
      model = getOpenRouterModel();
      break;
    }
    case "xai": {
      model = getOpenRouterModel();
      break;
    }
    case "groq": {
      if (!groqApiKey) {
        throw new ChatRouteError(503, {
          error: "Groq is not configured in the current environment.",
        });
      } else {
        model = createGroq({
          apiKey: groqApiKey,
        })(resolvedModelId);
      }
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
    ...(Object.keys(anthropicOptions).length > 0
      ? {
          anthropic: anthropicOptions,
        }
      : {}),
    ...(googleThinkingLevel
      ? {
          google: {
            thinkingConfig: {
              thinkingLevel: googleThinkingLevel,
              includeThoughts: true,
            },
          } satisfies GoogleGenerativeAIProviderOptions,
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
  // forwarded in OpenRouter-compatible format. voids.top only understands OpenAI
  // chat-style options (and only for OpenAI-authored models).
  const openRouterBody = usesOpenRouter
    ? {
        ...(Object.keys(directProviderOptions).length > 0
          ? { providerOptions: directProviderOptions }
          : {}),
        ...(useFastMode ? { service_tier: "fast" as const } : {}),
      }
    : undefined;
  const providerOptions: ChatProviderOptions = (
    usesVoids
      ? providerId === "openai" && openaiProviderOptions
        ? { openai: openaiProviderOptions }
        : {}
      : !usesOpenRouter
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
