import { beforeEach, expect, test, vi } from "vitest";
import type { Context } from "../trpc";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { retrieve: mocks.retrieve } } },
}));
vi.mock("@/lib/billing-card-usage", () => ({
  getBillingFingerprintUpdates: async () => ({ paymentMethodFingerprint: null }),
}));

const { billingRouter } = await import("./billing");

const record = {
  id: "billing-1",
  userId: "user-1",
  organizationId: null,
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: null,
  planId: null,
  priceId: null,
  status: "inactive",
  mode: "subscription",
  currentPeriodEnd: null,
  deletionPending: false,
  firstPaidAt: new Date("2026-01-01T00:00:00Z"),
  flashOfferEndsAt: null,
};

function discountedSession() {
  return { ...lifetimeSession({}), payment_intent: null };
}

function lifetimeSession(charge: Record<string, unknown>) {
  return {
    id: "cs_lifetime",
    client_reference_id: "user-1",
    customer: "cus_1",
    mode: "payment",
    payment_status: "paid",
    metadata: { userId: "user-1", planId: "pro_lifetime" },
    subscription: null,
    line_items: { data: [] },
    payment_intent: {
      id: "pi_1",
      status: "succeeded",
      latest_charge: { refunded: false, disputed: false, amount_refunded: 0, ...charge },
    },
  };
}

const caller = () =>
  billingRouter.createCaller({
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [record] }) }) }),
      insert: mocks.insert,
      transaction: async (run: (tx: unknown) => unknown) =>
        run({ execute: mocks.execute, insert: mocks.insert }),
    } as unknown as Context["db"],
    session: {
      session: { userId: "user-1" },
      user: { isAnonymous: false },
    } as Context["session"],
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({
    values: (values: object) => ({
      onConflictDoUpdate: () => ({
        returning: async () => [{ ...record, ...(Array.isArray(values) ? values[0] : values) }],
      }),
    }),
  });
});

test("replaying a refunded lifetime checkout does not restore the revoked plan", async () => {
  mocks.retrieve.mockResolvedValue(lifetimeSession({ refunded: true, amount_refunded: 1000 }));

  const result = await caller().confirmCheckout({ sessionId: "cs_lifetime" });

  expect(mocks.retrieve).toHaveBeenCalledWith("cs_lifetime", {
    expand: expect.arrayContaining(["payment_intent.latest_charge"]),
  });
  expect(result).toMatchObject({ planId: null, status: "inactive" });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("replaying a disputed lifetime checkout does not restore the revoked plan", async () => {
  mocks.retrieve.mockResolvedValue(lifetimeSession({ disputed: true }));

  await caller().confirmCheckout({ sessionId: "cs_lifetime" });

  expect(mocks.insert).not.toHaveBeenCalled();
});

test("an unreversed lifetime checkout is still confirmed", async () => {
  mocks.retrieve.mockResolvedValue(lifetimeSession({}));

  const result = await caller().confirmCheckout({ sessionId: "cs_lifetime" });

  expect(result).toMatchObject({ planId: "pro_lifetime", status: "paid", mode: "payment" });
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});

test("a refund landing before the locked write does not grant the lifetime plan", async () => {
  mocks.retrieve
    .mockResolvedValueOnce(lifetimeSession({}))
    .mockResolvedValueOnce(lifetimeSession({ refunded: true, amount_refunded: 1000 }));
  mocks.execute.mockImplementation(async () => {
    // The live recheck must run after the user row lock is taken.
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
  });

  const result = await caller().confirmCheckout({ sessionId: "cs_lifetime" });

  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ planId: null, status: "inactive" });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("a fully discounted lifetime checkout is still confirmed", async () => {
  mocks.retrieve.mockResolvedValue(discountedSession());

  const result = await caller().confirmCheckout({ sessionId: "cs_lifetime" });

  expect(result).toMatchObject({ planId: "pro_lifetime", status: "paid", mode: "payment" });
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});
