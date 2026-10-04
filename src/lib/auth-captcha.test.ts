import { afterEach, expect, test, vi } from "vitest";

type PluginLike = { id: string; options?: { endpoints?: string[] } };

// Each case re-imports the full auth module graph; the first cold import is slow.
const AUTH_IMPORT_TIMEOUT = { timeout: 30_000 };

async function loadAuth(turnstile: { secretKey: string; siteKey: string }) {
  vi.resetModules();
  // `src/env.ts` treats empty strings as unset, matching unconfigured deploys.
  vi.stubEnv("TURNSTILE_SECRET_KEY", turnstile.secretKey);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", turnstile.siteKey);
  const { auth } = await import("./auth");
  const plugins = (auth.options.plugins ?? []) as unknown as PluginLike[];
  return { auth, captcha: plugins.find((plugin) => plugin.id === "captcha") };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test(
  "Turnstile protects guest sign-in alongside the email auth endpoints",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const { captcha } = await loadAuth({ secretKey: "test-secret", siteKey: "test-site-key" });

    expect(captcha?.options?.endpoints).toEqual(
      expect.arrayContaining([
        "/sign-up/email",
        "/sign-in/email",
        "/request-password-reset",
        "/sign-in/magic-link",
        "/sign-in/anonymous",
      ]),
    );
  },
);

test(
  "guest sign-in without a Turnstile token is rejected before an account is created",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const { auth } = await loadAuth({ secretKey: "test-secret", siteKey: "test-site-key" });

    // The captcha plugin answers from `onRequest` when the header is missing, so
    // this neither reaches the database nor contacts Cloudflare.
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/anonymous", { method: "POST" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "MISSING_RESPONSE" });
  },
);

test(
  "guest sign-in stays unchallenged when Turnstile is not configured",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const { captcha } = await loadAuth({ secretKey: "", siteKey: "" });

    expect(captcha).toBeUndefined();
  },
);
