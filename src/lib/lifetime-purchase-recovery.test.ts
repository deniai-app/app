import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  retrieve: vi.fn(),
  execute: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { list: mocks.list, retrieve: mocks.retrieve } } },
}));

const { findPaidLifetimePurchase, saveLifetimePlan } = await import("./lifetime-plan");

function session(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    mode: "payment",
    payment_status: "paid",
    metadata: { planId: "pro_lifetime" },
    payment_intent: {
      id: `pi_${id}`,
      metadata: { priceId: "price_lifetime" },
      latest_charge: { refunded: false, disputed: false, amount_refunded: 0 },
    },
    ...overrides,
  };
}

function charged(id: string, charge: Record<string, unknown>) {
  return session(id, {
    payment_intent: {
      id: `pi_${id}`,
      metadata: {},
      latest_charge: { refunded: false, disputed: false, amount_refunded: 0, ...charge },
    },
  });
}

const discounted = session("cs_free", { payment_intent: null });

const database = {
  transaction: async (run: (tx: unknown) => unknown) =>
    run({ execute: mocks.execute, insert: mocks.insert }),
} as unknown as Parameters<typeof saveLifetimePlan>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({
    values: (values: object) => ({
      onConflictDoUpdate: () => ({ returning: async () => [values] }),
    }),
  });
});

test("skips unpaid, refunded, and disputed sessions but recovers a fully discounted one", async () => {
  mocks.list.mockResolvedValue({
    data: [
      session("cs_unpaid", { payment_status: "unpaid", payment_intent: null }),
      charged("cs_refunded", { refunded: true, amount_refunded: 1000 }),
      charged("cs_partial", { amount_refunded: 100 }),
      charged("cs_disputed", { disputed: true }),
      discounted,
    ],
  });

  await expect(findPaidLifetimePurchase("cus_1")).resolves.toEqual({
    planId: "pro_lifetime",
    priceId: null,
    checkoutSessionId: "cs_free",
  });
});

test("returns nothing when every lifetime session is unpaid or reversed", async () => {
  mocks.list.mockResolvedValue({
    data: [
      session("cs_unpaid", { payment_status: "unpaid", payment_intent: null }),
      charged("cs_refunded", { refunded: true }),
      charged("cs_disputed", { disputed: true }),
    ],
  });

  await expect(findPaidLifetimePurchase("cus_1")).resolves.toBeNull();
});

test("a recovered discounted purchase is restored under the user lock", async () => {
  mocks.list.mockResolvedValue({ data: [discounted] });
  mocks.retrieve.mockResolvedValue(discounted);

  const purchase = await findPaidLifetimePurchase("cus_1");
  const saved = await saveLifetimePlan(database, {
    userId: "user-1",
    customerId: "cus_1",
    purchase: purchase!,
  });

  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(saved).toMatchObject({
    planId: "pro_lifetime",
    status: "paid",
    mode: "payment",
    checkoutSessionId: "cs_free",
  });
});

test("an unpaid live session is not restored", async () => {
  mocks.retrieve.mockResolvedValue({ ...discounted, payment_status: "unpaid" });

  const saved = await saveLifetimePlan(database, {
    userId: "user-1",
    customerId: "cus_1",
    purchase: { planId: "pro_lifetime", priceId: null, checkoutSessionId: "cs_free" },
  });

  expect(saved).toBeUndefined();
  expect(mocks.insert).not.toHaveBeenCalled();
});
