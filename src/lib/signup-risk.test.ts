import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rows: [] as unknown[],
  failSelect: false,
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/env", () => ({ env: { BETTER_AUTH_SECRET: "test-secret" } }));

const {
  assessSignup,
  checkSignupLimits,
  isAutomationUserAgent,
  isSignupFlagged,
  networkKey,
  SIGNUP_RISK_FLAGS,
} = await import("./signup-risk");

const browser =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

beforeEach(() => {
  mocks.checkRateLimit.mockReset();
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.rows = [];
  mocks.failSelect = false;
});

test("an ordinary first sign-up is not flagged", () => {
  const result = assessSignup({
    email: "yamada.taro@icloud.com",
    userAgent: browser,
    networkAccountCount: 1,
  });
  expect(result).toEqual({ score: 0, flags: [], flagged: false });
});

test("a birth-year address alone is not enough to flag a real user", () => {
  const result = assessSignup({
    email: "taro1990@icloud.com",
    userAgent: browser,
    networkAccountCount: 1,
  });
  expect(result.flags).toEqual([SIGNUP_RISK_FLAGS.randomLocalPart]);
  expect(result.flagged).toBe(false);
});

test("the same address shape as a second account from one network is flagged", () => {
  const result = assessSignup({
    email: "muxjcx87394v@icloud.com",
    userAgent: browser,
    networkAccountCount: 2,
  });
  expect(result.flagged).toBe(true);
  expect(result.flags).toContain(SIGNUP_RISK_FLAGS.repeatNetwork);
});

test("a third account from one network is flagged whatever the address", () => {
  const result = assessSignup({
    email: "yamada.taro@icloud.com",
    userAgent: browser,
    networkAccountCount: 3,
  });
  expect(result.flagged).toBe(true);
});

test("a scripted client is flagged on its own", () => {
  for (const userAgent of ["python-requests/2.31", "curl/8.4.0", "", null, undefined]) {
    expect(
      assessSignup({ email: "a.b@icloud.com", userAgent, networkAccountCount: 1 }).flagged,
    ).toBe(true);
  }
  expect(isAutomationUserAgent(browser)).toBe(false);
});

test("school addresses are not flagged for sharing a network or having digits", () => {
  const result = assessSignup({
    email: "s2412345@u-tokyo.ac.jp",
    userAgent: browser,
    networkAccountCount: 30,
  });
  expect(result).toEqual({ score: 0, flags: [], flagged: false });
});

test("an unknown network adds no network signals", () => {
  const result = assessSignup({
    email: "yamada.taro@icloud.com",
    userAgent: browser,
    networkAccountCount: null,
  });
  expect(result.flagged).toBe(false);
});

test("IPv6 addresses are grouped by their /64", () => {
  expect(networkKey("203.0.113.9")).toBe("203.0.113.9");
  expect(networkKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2");
  expect(networkKey("2001:db8:1:2:1111:2222:3333:4444")).toBe("2001:db8:1:2");
  expect(networkKey("2001:db8:1::5")).toBe("2001:db8:1:0");
  expect(networkKey("2001:0DB8:0001:0000:0000:0000:0000:0005")).toBe("2001:db8:1:0");
  expect(networkKey("2001:db8:1:0:abcd::5")).toBe("2001:db8:1:0");
  expect(networkKey("2001::1:2:3:4:5")).toBe("2001:0:0:1");
  expect(networkKey("2001::2:2:3:4:5")).toBe("2001:0:0:2");
  expect(networkKey("::1")).toBe("0:0:0:0");
  expect(networkKey("fe80::1%eth0")).toBe("fe80:0:0:0");
});

test("IPv4-mapped addresses use the same limit as native IPv4", () => {
  expect(networkKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  expect(networkKey("0:0:0:0:0:ffff:cb00:7109")).toBe("203.0.113.9");
  expect(networkKey("::ffff:203.0.113.10")).toBe("203.0.113.10");
});

test("sign-ups are refused once a network passes its daily cap", async () => {
  mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 600 });
  const result = await checkSignupLimits({ email: "a.b@icloud.com", ip: "203.0.113.9" });
  expect(result).toEqual({ allowed: false, retryAfter: 600 });
  expect(mocks.checkRateLimit.mock.calls[0][0]).toMatchObject({
    key: "signup:day:203.0.113.9",
    maxRequests: 8,
  });
});

test("the hourly burst cap applies to personal addresses only", async () => {
  await checkSignupLimits({ email: "a.b@icloud.com", ip: "203.0.113.9" });
  expect(mocks.checkRateLimit.mock.calls.map(([call]) => call.key)).toEqual([
    "signup:day:203.0.113.9",
    "signup:hour:203.0.113.9",
  ]);

  mocks.checkRateLimit.mockClear();
  await checkSignupLimits({ email: "s1@u-tokyo.ac.jp", ip: "203.0.113.9" });
  expect(mocks.checkRateLimit.mock.calls).toHaveLength(1);
  expect(mocks.checkRateLimit.mock.calls[0][0].maxRequests).toBe(60);
});

test("without a usable IP nothing is limited", async () => {
  expect(await checkSignupLimits({ email: "a.b@icloud.com", ip: undefined })).toEqual({
    allowed: true,
  });
  expect(mocks.checkRateLimit).not.toHaveBeenCalled();
});

test("a failed flag lookup counts as not flagged", async () => {
  const failing = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            throw new Error('relation "signup_risk" does not exist');
          },
        }),
      }),
    }),
  };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(await isSignupFlagged("user", failing as never)).toBe(false);
  warn.mockRestore();
});
