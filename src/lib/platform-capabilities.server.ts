import { env } from "@/env";
import type { PlatformCapabilities, SocialProviderId } from "./platform-capabilities";

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Derives capabilities from the current environment. Call it after a request-time
 * API (e.g. `connection()`) in anything that is prerendered; otherwise the value is
 * fixed at `next build`, when server secrets are usually absent (CI image builds).
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const hasDeniApi = hasValue(env.DENI_API_KEY);
  const hasOpenRouter = hasValue(env.OPENROUTER_API_KEY);
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

  return {
    models: {
      openai: hasOpenRouter,
      anthropic: hasOpenRouter,
      google: hasOpenRouter,
      xai: hasOpenRouter,
      deni: hasDeniApi,
    },
    features: {
      webSearch: hasValue(env.EXA_API_KEY),
      memory: hasOpenRouter,
      billing: hasStripeSecret && hasStripePublishableKey && !billingExplicitlyDisabled,
    },
    auth: {
      socialProviders,
      captcha: hasValue(env.TURNSTILE_SECRET_KEY) && hasValue(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    },
  };
}

/** For request-time server code (route handlers, tRPC, libs). Not for prerendered UI. */
export const platformCapabilities = getPlatformCapabilities();
