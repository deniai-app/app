import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test(
  "letters-plus-digits signups use the configured CAPTCHA and mailbox verification",
  { timeout: 30_000 },
  async () => {
    vi.resetModules();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const { auth } = await import("./auth");
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
    const beforeCreate = auth.options.databaseHooks.user.create.before;
    await expect(
      beforeCreate(
        {
          id: "user",
          name: "Taro",
          email: "taro1990@outlook.com",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        null,
      ),
    ).resolves.toBeUndefined();
    // CAPTCHA rejects before any database call or Cloudflare network request.
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          email: "taro1990@outlook.com",
          name: "Taro",
          password: "test-password123",
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "MISSING_RESPONSE" });
  },
);
