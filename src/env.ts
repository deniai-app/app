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
    STRIPE_FLASH_OFFER_COUPON_ID: z.string().min(1).optional(),
    AFFILIATE_ADMIN_EMAILS: z.string().min(1).optional(),
    BLOG_ADMIN_EMAILS: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    /**
     * OpenAI-compatible Deni AI API. Both key and base URL are required to
     * expose DeepSeek / MiniMax models routed through this provider.
     */
    DENI_API_KEY: z.string().min(1).optional(),
    DENI_API_BASE_URL: z.url().optional(),
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
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    DENI_API_KEY: process.env.DENI_API_KEY,
    DENI_API_BASE_URL: process.env.DENI_API_BASE_URL,
    EXA_API_KEY: process.env.EXA_API_KEY,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    STRIPE_FLASH_OFFER_COUPON_ID: process.env.STRIPE_FLASH_OFFER_COUPON_ID,
    AFFILIATE_ADMIN_EMAILS: process.env.AFFILIATE_ADMIN_EMAILS,
    BLOG_ADMIN_EMAILS: process.env.BLOG_ADMIN_EMAILS,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
  },
});
