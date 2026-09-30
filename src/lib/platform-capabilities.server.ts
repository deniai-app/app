import { env } from "@/env";
import type { PlatformCapabilities, SocialProviderId } from "./platform-capabilities";

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

const hasAnthropic = hasValue(env.ANTHROPIC_API_KEY);
const hasGoogle = hasValue(env.GOOGLE_GENERATIVE_AI_API_KEY);
const hasGroq = hasValue(env.GROQ_API_KEY);
const hasDeniApi = hasValue(env.DENI_API_KEY) && hasValue(env.DENI_API_BASE_URL);
const hasOpenRouter = hasValue(env.OPENROUTER_API_KEY);
const hasVoids = Boolean(env.VOIDS_MODE && hasValue(env.VOIDS_API_KEY));
const hasStripeSecret = hasValue(env.STRIPE_SECRET_KEY);
const hasStripePublishableKey = hasValue(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
const billingExplicitlyDisabled = ["1", "true"].includes(
  env.NEXT_PUBLIC_BILLING_DISABLED?.trim().toLowerCase() ?? "",
);

const socialProviders: SocialProviderId[] = [];
if (hasValue(env.GOOGLE_CLIENT_ID) && hasValue(env.GOOGLE_CLIENT_SECRET)) {
  socialProviders.push("google");
}
if (hasValue(env.GITHUB_CLIENT_ID) && hasValue(env.GITHUB_CLIENT_SECRET)) {
  socialProviders.push("github");
}

export const platformCapabilities = {
  models: {
    openai: hasOpenRouter || hasVoids,
    anthropic: hasAnthropic || hasOpenRouter || hasVoids,
    // Platform Gemini chat models are routed through OpenRouter; the Google
    // key gates memory below.
    google: hasOpenRouter,
    xai: hasOpenRouter,
    groq: hasGroq,
    deni: hasDeniApi,
  },
  features: {
    webSearch: hasValue(env.EXA_API_KEY),
    memory: hasGoogle,
    billing: hasStripeSecret && hasStripePublishableKey && !billingExplicitlyDisabled,
  },
  auth: {
    socialProviders,
    captcha: hasValue(env.TURNSTILE_SECRET_KEY) && hasValue(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  },
} satisfies PlatformCapabilities;
