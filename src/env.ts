import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Docker/Dokploy often inject unset optionals as "" rather than omitting them.
   * Treat empty strings as undefined so `.optional()` / `.url().optional()` work.
   */
  emptyStringAsUndefined: true,
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().length(32),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(32).optional(),
    STRIPE_FLASH_OFFER_COUPON_ID: z.string().min(1).optional(),
    /**
     * Customer Portal configuration (`bpc_...`) used for billing portal sessions.
     * Create it with `pnpm run tools:stripe-portal`. When unset, Stripe's default
     * portal configuration applies and must have subscription updates disabled.
     */
    STRIPE_PORTAL_CONFIGURATION_ID: z.string().min(1).optional(),
    AFFILIATE_ADMIN_EMAILS: z.string().min(1).optional(),
    BLOG_ADMIN_EMAILS: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    /**
     * OpenAI-compatible Deni AI API. The key is required to expose non-Luna
     * OpenAI models; the base URL has a default.
     */
    DENI_API_KEY: z.string().min(1).optional(),
    DENI_API_BASE_URL: z.url().default("https://api.deniai.app/v1"),
    // Optional strings preserve parseFloat prefix parsing and fallback defaults
    // in token-weighting.ts; invalid/negative/non-finite values use defaults.
    FLIXA_USAGE_WEIGHT_INPUT: z.string().optional(),
    FLIXA_USAGE_WEIGHT_CACHE_READ: z.string().optional(),
    FLIXA_USAGE_WEIGHT_CACHE_WRITE: z.string().optional(),
    FLIXA_USAGE_WEIGHT_OUTPUT: z.string().optional(),
    EXA_API_KEY: z.string().min(1).optional(),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    /**
     * Cloudflare Email Sending (optional). Both account id and API token are
     * required to enable transactional email (magic link, verification, etc.).
     * Token needs Email Sending: Edit permission.
     */
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
    CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    UPLOADTHING_TOKEN: z.string().min(1).optional(),
    /**
     * Client IP resolution behind proxies (see `src/lib/client-ip.ts` and SETUP.md).
     * CLIENT_IP_HEADER: single-value header set by the trusted edge (e.g.
     * cf-connecting-ip); takes precedence. TRUSTED_PROXY_HOPS: number of trusted
     * proxies appending to X-Forwarded-For. Neither: first X-Forwarded-For entry
     * (spoofable unless the edge overwrites it).
     */
    CLIENT_IP_HEADER: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9!#$%&'*+.^_`|~-]+$/, "CLIENT_IP_HEADER must be a header name")
      .optional(),
    TRUSTED_PROXY_HOPS: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "TRUSTED_PROXY_HOPS must be a positive integer")
      .transform(Number)
      .optional(),
  },
  client: {
    /**
     * Public app origin (OAuth callbacks, affiliate invite redirects, emails).
     * Must be the real public URL (e.g. https://deniai.app) — never the Docker
     * bind address (0.0.0.0) or an internal container hostname.
     */
    NEXT_PUBLIC_BETTER_AUTH_URL: z.url().refine((value) => {
      try {
        const host = new URL(value).hostname;
        return host !== "0.0.0.0" && host !== "::" && host !== "[::]";
      } catch {
        return false;
      }
    }, "NEXT_PUBLIC_BETTER_AUTH_URL must be a public origin (not 0.0.0.0)"),
    NEXT_PUBLIC_BILLING_DISABLED: z.string().min(1).optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
  },
  // If you're using Next.js < 13.4.4, you'll need to specify the runtimeEnv manually
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    NEXT_PUBLIC_BILLING_DISABLED: process.env.NEXT_PUBLIC_BILLING_DISABLED,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    DENI_API_KEY: process.env.DENI_API_KEY,
    DENI_API_BASE_URL: process.env.DENI_API_BASE_URL,
    FLIXA_USAGE_WEIGHT_INPUT: process.env.FLIXA_USAGE_WEIGHT_INPUT,
    FLIXA_USAGE_WEIGHT_CACHE_READ: process.env.FLIXA_USAGE_WEIGHT_CACHE_READ,
    FLIXA_USAGE_WEIGHT_CACHE_WRITE: process.env.FLIXA_USAGE_WEIGHT_CACHE_WRITE,
    FLIXA_USAGE_WEIGHT_OUTPUT: process.env.FLIXA_USAGE_WEIGHT_OUTPUT,
    EXA_API_KEY: process.env.EXA_API_KEY,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    STRIPE_FLASH_OFFER_COUPON_ID: process.env.STRIPE_FLASH_OFFER_COUPON_ID,
    STRIPE_PORTAL_CONFIGURATION_ID: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    AFFILIATE_ADMIN_EMAILS: process.env.AFFILIATE_ADMIN_EMAILS,
    BLOG_ADMIN_EMAILS: process.env.BLOG_ADMIN_EMAILS,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    CLIENT_IP_HEADER: process.env.CLIENT_IP_HEADER,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
  },
});
