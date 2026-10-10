import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: vi.fn() }));

let auth: typeof import("./auth").auth;
beforeAll(async () => {
  ({ auth } = await import("./auth"));
}, 30_000);

function newUser(email: string) {
  return {
    id: "user",
    name: "Test",
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const oauthContexts = [
  { path: "/callback/:id", params: { id: "google" } },
  { path: "/callback/:id", params: { id: "github" } },
  { path: "/sign-in/social", body: { provider: "google" } },
  { path: "/sign-in/social", body: { provider: "github" } },
];

test.each(oauthContexts)("OAuth domain allowlist applies to %j", async (ctx) => {
  const beforeCreate = auth.options.databaseHooks.user.create.before;
  for (const email of [
    "person@catpost.site",
    "person@company.example",
    "person@outlook.com.catpost.site",
    "person@school.edu.kg",
  ]) {
    await expect(beforeCreate(newUser(email), ctx as never)).rejects.toMatchObject({
      body: { code: "EMAIL_DOMAIN_NOT_ALLOWED" },
    });
  }
  for (const email of ["person@outlook.com", "person@u-tokyo.ac.jp"]) {
    await expect(beforeCreate(newUser(email), ctx as never)).resolves.toBeUndefined();
  }
});

test.each(["gmail.com", "googlemail.com"])(
  "%s requires Google on both OAuth entry points",
  async (domain) => {
    const beforeCreate = auth.options.databaseHooks.user.create.before;
    for (const ctx of oauthContexts) {
      const provider = ctx.params?.id ?? ctx.body?.provider;
      const result = beforeCreate(newUser(`first.last@${domain}`), ctx as never);
      if (provider === "google") {
        await expect(result).resolves.toBeUndefined();
      } else {
        await expect(result).rejects.toMatchObject({ body: { code: "EMAIL_USE_GOOGLE_OAUTH" } });
      }
    }
  },
);

test("a claimed provider in an email signup cannot enable the Google exception", async () => {
  const beforeCreate = auth.options.databaseHooks.user.create.before;
  await expect(
    beforeCreate(newUser("person@gmail.com"), {
      path: "/sign-up/email",
      body: { provider: "google" },
    } as never),
  ).rejects.toMatchObject({ body: { code: "EMAIL_USE_GOOGLE_OAUTH" } });
});

test("alias restrictions remain specific to email registration", async () => {
  const beforeCreate = auth.options.databaseHooks.user.create.before;
  const user = newUser("person+tag@outlook.com");
  for (const ctx of oauthContexts) {
    await expect(beforeCreate(user, ctx as never)).resolves.toBeUndefined();
  }
  await expect(beforeCreate(user, null)).rejects.toMatchObject({
    body: { code: "EMAIL_ALIAS_NOT_ALLOWED" },
  });
});
