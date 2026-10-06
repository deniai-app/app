import { expect, test, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/db/drizzle", () => ({ db: {} }));

const { resolveSubscriptionStatus } = await import("./lifetime-plan");

test("an ended subscription is inactive, not a canceled grace period", () => {
  expect(
    resolveSubscriptionStatus({ status: "canceled", cancel_at_period_end: false, cancel_at: null }),
  ).toBe("inactive");
});

test("a subscription set to end keeps `canceled` until the period ends", () => {
  expect(
    resolveSubscriptionStatus({ status: "active", cancel_at_period_end: true, cancel_at: null }),
  ).toBe("canceled");
  expect(
    resolveSubscriptionStatus({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: 1_900_000_000,
    }),
  ).toBe("canceled");
});

test("other statuses pass through", () => {
  expect(
    resolveSubscriptionStatus({ status: "past_due", cancel_at_period_end: false, cancel_at: null }),
  ).toBe("past_due");
});
