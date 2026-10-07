export type Author = "openai" | "anthropic" | "google" | "xai" | "deepseek" | "minimax";

export const reasoningEffortValues = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ReasoningEffort = (typeof reasoningEffortValues)[number];
export type ModelEfforts = readonly ReasoningEffort[] | false;

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (reasoningEffortValues as readonly string[]).includes(value);
}

export function getPreferredReasoningEffort(efforts: ModelEfforts): ReasoningEffort {
  if (efforts === false) {
    return "high";
  }

  const preferredOrder: readonly ReasoningEffort[] = [
    "high",
    "medium",
    "low",
    "minimal",
    "none",
    "xhigh",
    "max",
  ];

  for (const effort of preferredOrder) {
    if (efforts.includes(effort)) {
      return effort;
    }
  }

  return efforts[0] ?? "high";
}

export function resolveReasoningEffort(
  efforts: ModelEfforts,
  requestedEffort: string | null | undefined,
): ReasoningEffort | undefined {
  if (efforts === false) {
    return undefined;
  }

  if (requestedEffort && isReasoningEffort(requestedEffort) && efforts.includes(requestedEffort)) {
    return requestedEffort;
  }

  return getPreferredReasoningEffort(efforts);
}

export type Models = {
  [key: string]: {
    author: Author;
    model: string;
    label: string;
    provider: string;
  };
};

export type ModelDeprecation = {
  date: string;
  kind: "retirement" | "shutdown";
  tentative?: boolean;
};

export type ModelDefinition = {
  name: string;
  value: string;
  author: Author;
  description?: string;
  featured?: boolean;
  premium?: boolean;
  /**
   * When true, the model is limited to paid tiers (Plus / Pro / Max / Team).
   * Card verification on the Free plan does not unlock it.
   */
  paidOnly?: boolean;
  default?: boolean;
  provider?: string;
  features: string[];
  efforts: ModelEfforts;
  contextWindow?: number;
  /**
   * Multiplier applied to the model's token consumption when billing
   * usage. `undefined` and `1` both mean "no multiplier". Values > 1
   * cause each token to count as that many tokens toward the user's
   * monthly quota and are surfaced to users in the UI.
   */
  tokenMultiplier?: number;
  /**
   * When true, the model supports OpenAI Pro reasoning mode
   * (`reasoning.mode: "pro"`), available on GPT-5.6 and GPT-6. Enabling Pro
   * multiplies usage by {@link OPENAI_PRO_MODE_MULTIPLIER} on top of the base
   * token multiplier.
   */
  supportsProMode?: boolean;
  /**
   * When true, the model supports OpenAI Fast mode (`service_tier: "fast"`,
   * formerly Priority Processing). Enabling Fast multiplies usage by
   * {@link OPENAI_FAST_MODE_MULTIPLIER} on top of the base token multiplier.
   */
  supportsFastMode?: boolean;
  /**
   * Provider lifecycle details from an upcoming deprecation or retirement notice.
   * The date is stored as an ISO calendar date (`YYYY-MM-DD`). A tentative date
   * is the provider's earliest stated retirement date, not a confirmed shutdown.
   */
  deprecation?: ModelDeprecation;
};

export function formatModelDeprecationDate(date: string, locale: string): string {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsedDate);
}

// Quota cost tiers use the mean standard input/output price per 1M tokens:
// < $5 = 1x, < $10 = 1.5x, < $20 = 2x, < $40 = 3x, < $60 = 4x, otherwise 5x.
// Rates checked 2026-09-23 against:
// https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
// https://ai.google.dev/gemini-api/docs/pricing
// https://console.groq.com/docs/models
// https://openrouter.ai/api/v1/models (routed model variants)
// Pro/Fast mode and long-context multipliers are applied separately.
export const models: readonly ModelDefinition[] = [
  {
    name: "GPT-6 Astra",
    value: "gpt-6-astra",
    supportsProMode: true,
    supportsFastMode: true,
    tokenMultiplier: 3,
    author: "openai",
    description: "OpenAI flagship for complex reasoning, coding, and agentic work.",
    premium: true,
    paidOnly: true,
    featured: true,
    features: ["smartest", "reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "GPT-6 Sol",
    value: "gpt-6-sol",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "High-end GPT-6 model for demanding reasoning, coding, and agentic work.",
    features: ["reasoning", "coding", "smart", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-6.1 Sol",
    value: "gpt-6.1-sol",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "High-end GPT-6.1 model for demanding reasoning, coding, and agentic work.",
    featured: true,
    features: ["reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-6 Luna",
    value: "gpt-6-luna",
    tokenMultiplier: 1,
    author: "openai",
    description: "Fast, cost-efficient GPT-6 model for high-volume tasks.",
    featured: true,
    features: ["reasoning", "fast", "fastest"],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-5.6 Sol",
    value: "gpt-5.6-sol",
    tokenMultiplier: 2,
    author: "openai",
    description: "OpenAI flagship for complex reasoning, coding, and agentic work.",
    features: ["smartest", "reasoning", "coding", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-5.6 Terra",
    value: "gpt-5.6-terra",
    tokenMultiplier: 1,
    author: "openai",
    description: "Balanced GPT-5.6 model for everyday work at half the cost of Sol.",
    features: ["reasoning", "smart", "coding", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-5.6 Luna",
    value: "gpt-5.6-luna",
    tokenMultiplier: 1,
    author: "openai",
    description: "Fastest, most affordable GPT-5.6 model for high-volume tasks.",
    default: true,
    features: ["reasoning", "fast", "fastest"],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    supportsProMode: true,
    supportsFastMode: true,
    contextWindow: 1_050_000,
  },
  {
    name: "GPT-5.5",
    value: "gpt-5.5",
    tokenMultiplier: 2,
    author: "openai",
    description: "A new class of intelligence for coding and professional work.",
    features: ["smartest", "reasoning", "coding", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh"],
    contextWindow: 1_000_000,
  },
  {
    name: "GPT-5.4",
    value: "gpt-5.4",
    tokenMultiplier: 1.5,
    author: "openai",
    default: false,
    description: "A more affordable model for coding and professional work.",
    features: ["reasoning", "smart", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh"],
    contextWindow: 1_000_000,
  },
  {
    name: "GPT-5.4 mini",
    value: "gpt-5.4-mini",
    tokenMultiplier: 1,
    author: "openai",
    default: false,
    description: "Our strongest mini model yet for coding, computer use, and subagents.",
    features: ["coding", "reasoning", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh"],
    contextWindow: 400_000,
  },
  {
    name: "GPT-5.4 nano",
    value: "gpt-5.4-nano",
    tokenMultiplier: 1,
    author: "openai",
    default: false,
    description: "Our cheapest GPT-5.4-class model for simple high-volume tasks.",
    features: ["reasoning", "fastest", "fast"],
    efforts: ["none", "low", "medium", "high", "xhigh"],
    contextWindow: 400_000,
  },
  {
    name: "GPT-5.3 Codex",
    value: "gpt-5.3-codex",
    tokenMultiplier: 1.5,
    author: "openai",
    default: false,
    description: "The most capable agentic coding model to date.",
    features: ["coding", "reasoning", "fast"],
    efforts: ["low", "medium", "high", "xhigh"],
  },
  {
    name: "GPT-5.2",
    value: "gpt-5.2",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "General purpose OpenAI model",
    features: ["smart", "reasoning", "fast"],
    default: false,
    efforts: ["none", "low", "medium", "high", "xhigh"],
  },
  {
    name: "GPT-5",
    value: "gpt-5",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "Flagship model for coding, reasoning, and agentic tasks across domains.",
    deprecation: { date: "2026-12-11", kind: "shutdown" },
    features: ["smart", "reasoning", "fast"],
    default: false,
    efforts: ["minimal", "low", "medium", "high"],
  },
  {
    name: "GPT-5 mini",
    value: "gpt-5-mini",
    tokenMultiplier: 1,
    author: "openai",
    description: "Faster, more affordable GPT-5 for well-defined tasks.",
    deprecation: { date: "2026-12-11", kind: "shutdown" },
    features: ["reasoning", "fast"],
    default: false,
    efforts: ["medium"],
  },
  {
    name: "GPT-5 nano",
    value: "gpt-5-nano",
    tokenMultiplier: 1,
    author: "openai",
    description: "Fastest, most cost-efficient GPT-5 model.",
    deprecation: { date: "2026-12-11", kind: "shutdown" },
    features: ["reasoning", "fast"],
    default: false,
    efforts: ["medium"],
  },
  {
    name: "GPT-4.1",
    value: "gpt-4.1",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "Smartest model for fast, everyday tasks.",
    features: ["fast"],
    default: false,
    efforts: false,
  },
  {
    name: "GPT-4o",
    value: "gpt-4o",
    tokenMultiplier: 1.5,
    author: "openai",
    description: "Fast, intelligent, flexible GPT model.",
    deprecation: { date: "2026-10-23", kind: "shutdown" },
    features: ["fast"],
    default: false,
    efforts: false,
  },
  {
    name: "GPT-4o mini",
    value: "gpt-4o-mini",
    tokenMultiplier: 1,
    author: "openai",
    description: "Fast, affordable small model for focused tasks.",
    features: ["fast"],
    default: false,
    efforts: false,
  },
  // {
  //   name: "GPT-5 Pro",
  //   value: "gpt-5-pro",
  //   description: "For hard tasks",
  //   author: "openai",
  //   features: ["smart", "reasoning"],
  // },
  {
    name: "GPT-oss 120b",
    value: "openai/gpt-oss-120b",
    tokenMultiplier: 1,
    author: "openai",
    description: "Most powerful open-weight model",
    features: ["reasoning", "fast"],
    efforts: ["low", "medium", "high"],
  },
  {
    name: "GPT-oss 20b",
    value: "openai/gpt-oss-20b",
    tokenMultiplier: 1,
    author: "openai",
    description: "Medium-sized open-weight model",
    features: ["reasoning", "fastest", "fast"],
    efforts: ["low", "medium", "high"],
  },
  {
    name: "Gemini 3.1 Pro",
    value: "gemini-3.1-pro-preview",
    tokenMultiplier: 1.5,
    author: "google",
    description: "Best for complex tasks",
    featured: true,
    features: ["smartest", "smart", "reasoning"],
    efforts: ["low", "high"],
  },
  {
    name: "Gemini 3.8 Flash",
    value: "gemini-3.8-flash",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for coding and agentic tasks",
    featured: true,
    features: ["reasoning", "fast", "coding"],
    efforts: ["low", "medium", "high"],
    contextWindow: 1_000_000,
  },
  {
    name: "Gemini 3.7 Flash",
    value: "gemini-3.7-flash",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for coding and agentic tasks",
    features: ["reasoning", "fast", "coding"],
    efforts: ["low", "medium", "high"],
    contextWindow: 1_000_000,
  },
  {
    name: "Gemini 3.6 Flash",
    value: "gemini-3.6-flash",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for everyday tasks",
    features: ["reasoning", "fast"],
    efforts: ["low", "medium", "high"],
    contextWindow: 1_000_000,
  },
  {
    name: "Gemini 3.5 Flash",
    value: "gemini-3.5-flash",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for everyday tasks",
    features: ["reasoning", "fast"],
    efforts: ["minimal", "low", "medium", "high"],
  },
  {
    name: "Gemini 3 Flash",
    value: "gemini-3-flash-preview",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for everyday tasks",
    default: false,
    features: ["reasoning", "fast"],
    efforts: ["minimal", "low", "medium", "high"],
  },
  {
    name: "Gemini 2.5 Flash Lite",
    value: "gemini-2.5-flash-lite",
    tokenMultiplier: 1,
    author: "google",
    description: "Best for high volume tasks",
    features: ["reasoning", "fast"],
    default: false,
    efforts: false,
  },
  {
    name: "Claude Opus 5.5",
    value: "claude-opus-5.5",
    tokenMultiplier: 2,
    author: "anthropic",
    description: "Anthropic's flagship for agentic coding, computer use, and knowledge work.",
    premium: true,
    featured: true,
    features: ["smartest", "reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Fable 5.1",
    value: "claude-fable-5.1",
    tokenMultiplier: 3,
    author: "anthropic",
    description:
      "Successor to Claude Fable 5 for long-running agentic coding, knowledge work, and research.",
    premium: true,
    paidOnly: true,
    featured: true,
    features: ["smartest", "reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Fable 5",
    value: "claude-fable-5",
    tokenMultiplier: 3,
    author: "anthropic",
    description: "Anthropic's most capable model for long-horizon agentic work.",
    premium: true,
    paidOnly: true,
    features: ["smartest", "reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Opus 5",
    value: "claude-opus-5",
    tokenMultiplier: 2,
    author: "anthropic",
    description: "For complex agentic coding and enterprise work.",
    premium: true,
    features: ["reasoning", "smart", "coding"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Sonnet 5.5",
    value: "claude-sonnet-5.5",
    tokenMultiplier: 1.5,
    author: "anthropic",
    description: "Fast, balanced model for coding, agents, and everyday knowledge work.",
    premium: true,
    featured: true,
    features: ["reasoning", "smart", "coding", "fast"],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Sonnet 5",
    value: "claude-sonnet-5",
    tokenMultiplier: 1.5,
    author: "anthropic",
    description: "Balanced Claude 5 model for coding, writing, and everyday agentic work.",
    premium: true,
    features: ["reasoning", "smart", "coding", "fast"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Haiku 5.5",
    value: "claude-haiku-5.5",
    tokenMultiplier: 1,
    author: "anthropic",
    description: "Fast, lightweight Claude 5 model for everyday chat and quick reasoning.",
    featured: true,
    features: ["reasoning", "smart", "fast"],
    efforts: ["low", "medium", "high"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Opus 4.7",
    value: "claude-opus-4.7",
    tokenMultiplier: 2,
    author: "anthropic",
    default: false,
    description: "All-around professional model",
    premium: true,
    features: ["reasoning", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Opus 4.6",
    value: "claude-opus-4.6",
    tokenMultiplier: 2,
    author: "anthropic",
    default: false,
    description: "Legacy All-around professional model",
    premium: true,
    features: ["reasoning", "smart"],
    efforts: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Sonnet 4.6",
    value: "claude-sonnet-4.6",
    tokenMultiplier: 1.5,
    author: "anthropic",
    default: false,
    description: "Hybrid reasoning model",
    premium: true,
    features: ["reasoning", "smart", "fast"],
    efforts: ["low", "medium", "high"],
    contextWindow: 1_000_000,
  },
  {
    name: "Claude Sonnet 4.5",
    value: "claude-sonnet-4.5",
    tokenMultiplier: 1.5,
    author: "anthropic",
    description: "Hybrid reasoning model",
    premium: true,
    default: false,
    features: ["reasoning", "smart", "fast"],
    efforts: false,
  },
  {
    name: "Claude Haiku 4.5",
    value: "claude-haiku-4.5",
    tokenMultiplier: 1,
    author: "anthropic",
    description: "Fast, lightweight Claude model for everyday chat and quick reasoning.",
    featured: true,
    features: ["reasoning", "smart", "fast"],
    efforts: false,
  },
  {
    name: "Claude Opus 4.5",
    value: "claude-opus-4.5",
    tokenMultiplier: 2,
    author: "anthropic",
    description: "Legacy professional model",
    premium: true,
    default: false,
    features: ["reasoning", "smart"],
    efforts: ["low", "medium", "high"],
  },
  // {
  //   name: "Grok 4.5",
  //   value: "grok-4.5",
  //   author: "xai",
  //   description: "xAI's smartest model for coding, knowledge work, and STEM.",
  //   featured: true,
  //   features: ["smartest", "reasoning", "coding", "smart"],
  //   efforts: ["low", "high"],
  //   contextWindow: 500_000,
  // },
  // {
  //   name: "Grok 4.3",
  //   value: "grok-4.3",
  //   author: "xai",
  //   description: "Strong all-around Grok model for reasoning, coding, and everyday agentic work.",
  //   features: ["reasoning", "smart", "coding", "fast"],
  //   efforts: ["low", "high"],
  //   contextWindow: 1_000_000,
  // },
  // {
  //   name: "Grok 4.20",
  //   value: "grok-4.20",
  //   author: "xai",
  //   description: "Long-context Grok model for research, tool use, and multi-step tasks.",
  //   features: ["reasoning", "smart", "fast"],
  //   efforts: ["low", "high"],
  //   contextWindow: 2_000_000,
  // },
  // {
  //   name: "Grok 4.20 Multi Agent",
  //   value: "grok-4.20-multi-agent",
  //   author: "xai",
  //   description: "Multi-agent Grok 4.20 for deep research with coordinated tool use.",
  //   features: ["reasoning", "smart"],
  //   efforts: false,
  //   contextWindow: 2_000_000,
  // },
  // {
  //   name: "Grok Build",
  //   value: "grok-build-0.1",
  //   author: "xai",
  //   description: "Fast coding model for agentic software engineering and Grok Build workflows.",
  //   features: ["coding", "reasoning", "fast"],
  //   efforts: false,
  //   contextWindow: 256_000,
  // },
  {
    name: "DeepSeek V4",
    value: "deepseek/deepseek-v4",
    tokenMultiplier: 1,
    author: "deepseek",
    provider: "deni",
    description: "DeepSeek V4 for reasoning, coding, and general agentic work.",
    features: ["reasoning", "coding", "smart"],
    efforts: ["low", "medium", "high"],
  },
  {
    name: "DeepSeek V4 Pro",
    value: "deepseek/deepseek-v4-pro",
    tokenMultiplier: 1,
    author: "deepseek",
    provider: "deni",
    description: "Higher-capacity DeepSeek V4 for harder reasoning and coding tasks.",
    featured: true,
    features: ["reasoning", "coding", "smart", "smartest"],
    efforts: ["low", "medium", "high"],
  },
  {
    name: "MiniMax M3",
    value: "minimax/minimax-m3",
    tokenMultiplier: 1,
    author: "minimax",
    provider: "deni",
    description: "MiniMax M3 for fast reasoning and everyday agentic tasks.",
    features: ["reasoning", "fast"],
    efforts: ["low", "medium", "high"],
  },
];

export const defaultModel = models.find((model) => model.value === "gpt-6-luna") ?? models[0];

/**
 * Models available on the Free plan.
 * Verified cards unlock the catalog except `paidOnly` models; paid tiers
 * (Plus / Pro / Max / Team) unlock everything.
 */
export const FREE_PLAN_MODEL_VALUES = [
  "gpt-6-luna",
  "claude-haiku-4.5",
  "gemini-3.8-flash",
] as const;

export type FreePlanModelValue = (typeof FREE_PLAN_MODEL_VALUES)[number];

const freePlanModelSet = new Set<string>(FREE_PLAN_MODEL_VALUES);

/** Guest sessions are intentionally limited to the default Luna model. */
export const GUEST_MODEL_VALUES = ["gpt-6-luna"] as const;

const guestModelSet = new Set<string>(GUEST_MODEL_VALUES);

export function isFreePlanModel(modelValue: string): boolean {
  return freePlanModelSet.has(modelValue);
}

export function isPaidOnlyModel(modelValue: string): boolean {
  return models.some((model) => model.value === modelValue && model.paidOnly);
}

export function isGuestModel(modelValue: string): boolean {
  return guestModelSet.has(modelValue);
}

export function getModelsForGuest() {
  return models.filter((model) => isGuestModel(model.value));
}

export function isModelAllowedForAccount(
  modelValue: string,
  tier: "free" | "plus" | "pro" | "max" | null | undefined,
  hasVerifiedPaymentMethod = false,
): boolean {
  if (tier && tier !== "free") {
    return true;
  }

  if (isPaidOnlyModel(modelValue)) {
    return false;
  }

  return hasVerifiedPaymentMethod || isFreePlanModel(modelValue);
}

/** Pro mode is limited to paid tiers; card verification on Free does not unlock it. */
export function isProModeAllowedForAccount(
  tier: "free" | "plus" | "pro" | "max" | null | undefined,
): boolean {
  return Boolean(tier && tier !== "free");
}

export function getModelsForPlanTier(
  tier: "free" | "plus" | "pro" | "max" | null | undefined,
  hasVerifiedPaymentMethod = false,
) {
  return models.filter((model) =>
    isModelAllowedForAccount(model.value, tier, hasVerifiedPaymentMethod),
  );
}

// Google Analytics
export const GA_ID = "G-B5H8G73JTN";

// Email configuration
export const EMAIL_FROM = "Deni AI <noreply@deniai.app>";

export function getModelDefinition(modelId: string) {
  return models.find((model) => model.value === modelId);
}

export function getModelContextWindow(modelId: string) {
  return getModelDefinition(modelId)?.contextWindow;
}

export function getModelTokenMultiplier(modelId: string): number {
  const multiplier = getModelDefinition(modelId)?.tokenMultiplier;
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier < 1) {
    return 1;
  }
  return multiplier;
}

/**
 * OpenAI 1M-class models bill long-context sessions at a premium when the
 * prompt exceeds this input-token threshold. Matches product policy:
 * 2× usage for the full session once input > 200K tokens.
 */
export const OPENAI_LONG_CONTEXT_INPUT_THRESHOLD = 200_000;
export const OPENAI_LONG_CONTEXT_MULTIPLIER = 2;
const OPENAI_LONG_CONTEXT_MIN_WINDOW = 1_000_000;

/**
 * GPT-5.6 and GPT-6 Pro reasoning modes multiply billed usage by this factor
 * on top of the model's base token multiplier (product policy: base × 3).
 */
export const OPENAI_PRO_MODE_MULTIPLIER = 3;

/**
 * OpenAI Fast mode (`service_tier: "fast"`) multiplies billed usage by this
 * factor on top of the model's base token multiplier (API Fast pricing: 2×).
 */
export const OPENAI_FAST_MODE_MULTIPLIER = 2;

export function supportsOpenAILongContextPricing(modelId: string): boolean {
  const model = getModelDefinition(modelId);
  if (!model || model.author !== "openai") {
    return false;
  }
  return (model.contextWindow ?? 0) >= OPENAI_LONG_CONTEXT_MIN_WINDOW;
}

export function supportsModelProMode(modelId: string): boolean {
  return Boolean(getModelDefinition(modelId)?.supportsProMode);
}

export function supportsModelFastMode(modelId: string): boolean {
  return Boolean(getModelDefinition(modelId)?.supportsFastMode);
}

/**
 * Returns 2 when an OpenAI 1M-context model request exceeds the long-context
 * input threshold; otherwise 1.
 */
export function getOpenAILongContextMultiplier(modelId: string, inputTokens: number): number {
  if (!supportsOpenAILongContextPricing(modelId)) {
    return 1;
  }
  if (!Number.isFinite(inputTokens) || inputTokens <= OPENAI_LONG_CONTEXT_INPUT_THRESHOLD) {
    return 1;
  }
  return OPENAI_LONG_CONTEXT_MULTIPLIER;
}

export type EffectiveTokenMultiplierOptions = {
  proMode?: boolean;
  fastMode?: boolean;
};

/**
 * Combines the static model token multiplier with optional Pro-mode 3×,
 * Fast-mode 2×, and OpenAI long-context 2× pricing when `inputTokens` is
 * provided and exceeds the threshold.
 */
export function getEffectiveTokenMultiplier(
  modelId: string,
  inputTokens?: number,
  options?: EffectiveTokenMultiplierOptions,
): number {
  const base = getModelTokenMultiplier(modelId);
  const proMultiplier =
    options?.proMode && supportsModelProMode(modelId) ? OPENAI_PRO_MODE_MULTIPLIER : 1;
  const fastMultiplier =
    options?.fastMode && supportsModelFastMode(modelId) ? OPENAI_FAST_MODE_MULTIPLIER : 1;
  const withModes = base * proMultiplier * fastMultiplier;
  if (typeof inputTokens !== "number") {
    return withModes;
  }
  return withModes * getOpenAILongContextMultiplier(modelId, inputTokens);
}

// Transactional emails are rendered with react-email components under
// `src/emails/*` and sent from `src/lib/auth.ts`.
