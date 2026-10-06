import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: vi.fn() }));
afterEach(() => {
  vi.resetModules();
});

function newUser(email: string) {
  return {
    id: "user",
    name: "Test",
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const from = (ip: string) => ({ headers: new Headers({ "x-forwarded-for": ip }) });

test(
  "a network cannot mint accounts in a burst, on any sign-up path",
  { timeout: 30_000 },
  async () => {
    vi.resetModules();
    const { auth } = await import("./auth");
    const beforeCreate = auth.options.databaseHooks.user.create.before;
    const ctx = from("203.0.113.50");

    for (const name of ["anna.sato", "ben.ito", "chika.mori"]) {
      await expect(
        beforeCreate(newUser(`${name}@icloud.com`), ctx as never),
      ).resolves.toBeUndefined();
    }
    await expect(beforeCreate(newUser("dai.kato@icloud.com"), ctx as never)).rejects.toMatchObject({
      body: { code: "SIGNUP_RATE_LIMITED" },
    });
    // Another network is unaffected.
    await expect(
      beforeCreate(newUser("eri.abe@icloud.com"), from("203.0.113.51") as never),
    ).resolves.toBeUndefined();
  },
);

test("guest sessions are never counted against the cap", { timeout: 30_000 }, async () => {
  vi.resetModules();
  const { auth } = await import("./auth");
  const beforeCreate = auth.options.databaseHooks.user.create.before;
  for (let attempt = 0; attempt < 20; attempt++) {
    await expect(
      beforeCreate(
        { ...newUser(`guest${attempt}@example.invalid`), isAnonymous: true },
        from("203.0.113.52") as never,
      ),
    ).resolves.toBeUndefined();
  }
});

test("a school network can register a class", { timeout: 30_000 }, async () => {
  vi.resetModules();
  const { auth } = await import("./auth");
  const beforeCreate = auth.options.databaseHooks.user.create.before;
  for (let student = 0; student < 30; student++) {
    await expect(
      beforeCreate(
        newUser(`s24${String(student).padStart(5, "0")}@u-tokyo.ac.jp`),
        from("203.0.113.53") as never,
      ),
    ).resolves.toBeUndefined();
  }
});
