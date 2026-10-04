import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { billingRouter } from "@/server/api/routers/billing";

const state = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  subscriptions: [] as Record<string, unknown>[],
  checkoutSession: {} as Record<string, unknown>,
  completedSessions: [] as Record<string, unknown>[],
  createdSession: vi.fn(),
}));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/billing-trials", () => ({ isTrialEligibleForCustomer: async () => false }));
vi.mock("@/lib/affiliate", () => ({
  isAffiliatePaidStatus: () => false,
  processAffiliatePurchase: vi.fn(),
}));
vi.mock("@/lib/billing-card-usage", () => ({
  claimCardVerification: vi.fn(),
  getBillingFingerprintUpdates: async () => ({ paymentMethodFingerprint: null }),
  getCustomerPrimaryCardInfo: async () => ({ fingerprint: null, funding: "unknown" }),
  getCustomerPrimaryCardFingerprint: vi.fn(),
  isTrialFingerprintEligible: async () => false,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: [
          {
            id: `price_${lookup_keys[0]}`,
            lookup_key: lookup_keys[0],
            recurring: lookup_keys[0].endsWith("_lifetime") ? null : { interval: "month" },
          },
        ],
      }),
    },
    subscriptions: {
      list: async () => ({ data: state.subscriptions }),
      retrieve: async (id: string) => state.subscriptions.find((sub) => sub.id === id),
    },
    checkout: {
      sessions: {
        create: state.createdSession,
        retrieve: async () => state.checkoutSession,
        list: async () => ({ data: state.completedSessions }),
      },
    },
  },
}));

function database() {
  const apply = (updates: Record<string, unknown>) => {
    Object.assign(state.record, updates);
    return [state.record];
  };
  const database = {
    execute: async () => {},
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        let joined = false;
        const query = {
          // Joined billing reads are team plans; these tests cover personal billing.
          innerJoin: () => {
            joined = true;
            return query;
          },
          where: () => {
            const rows = getTableName(table) === "billing" && !joined ? [state.record] : [];
            const result = Promise.resolve(rows);
            return Object.assign(result, { limit: () => result });
          },
        };
        return query;
      },
    }),
    // Every test starts with an existing personal row, so upserts take the update path.
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
          returning: async () => apply(set),
        }),
      }),
    }),
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: () => {
          const result = Promise.resolve().then(() => apply(updates));
          return Object.assign(result, { returning: () => result });
        },
      }),
    }),
    transaction: async (run: (transaction: unknown) => Promise<unknown>) => run(database),
  };
  return database;
}

function caller() {
  return billingRouter.createCaller({
    db: database(),
    session: { session: { userId: "user" }, user: { isAnonymous: false, emailVerified: true } },
    userId: "user",
  } as never);
}

function subscription(status: string, lookupKey: string, planId = lookupKey) {
  return {
    id: "sub",
    customer: "customer",
    status,
    metadata: { planId },
    cancel_at: null,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "item",
          current_period_end: 1_900_000_000,
          price: { id: `price_${lookupKey}`, lookup_key: lookupKey, recurring: {} },
        },
      ],
    },
  };
}

const lifetimeRecord = {
  planId: "pro_lifetime",
  priceId: "price_pro_lifetime",
  status: "paid",
  mode: "payment",
  stripeSubscriptionId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.record = {
    id: "row",
    userId: "user",
    stripeCustomerId: "customer",
    stripeSubscriptionId: "sub",
    planId: "plus_monthly",
    priceId: "price_plus_monthly",
    status: "active",
    mode: "subscription",
    firstPaidAt: new Date(),
    flashOfferEndsAt: new Date(),
    checkoutSessionId: null,
  };
  state.subscriptions = [subscription("active", "plus_monthly")];
  state.completedSessions = [];
  state.checkoutSession = {};
  state.createdSession.mockResolvedValue({ id: "cs_new", client_secret: "secret" });
});

test("opening checkout does not touch the current plan", async () => {
  Object.assign(state.record, lifetimeRecord);
  state.subscriptions = [];
  await caller().createCheckoutSession({ planId: "max_monthly" });
  expect(state.record).toMatchObject({ ...lifetimeRecord, checkoutSessionId: "cs_new" });
});

test("an unpaid checkout session cannot change the plan", async () => {
  state.checkoutSession = {
    id: "cs_open",
    client_reference_id: "user",
    customer: "customer",
    mode: "payment",
    metadata: { userId: "user", planId: "pro_lifetime" },
    subscription: null,
    payment_intent: null,
    payment_status: "unpaid",
    line_items: { data: [{ price: { id: "price_pro_lifetime", lookup_key: "pro_lifetime" } }] },
  };
  await caller().confirmCheckout({ sessionId: "cs_open" });
  expect(state.record).toMatchObject({ planId: "plus_monthly", status: "active" });
});

test("team checkout sessions cannot be confirmed as a personal plan", async () => {
  state.checkoutSession = {
    id: "cs_team",
    client_reference_id: "user",
    metadata: { userId: "user", planId: "max_team_monthly", organizationId: "team" },
  };
  await expect(caller().confirmCheckout({ sessionId: "cs_team" })).rejects.toThrow(
    "not a personal plan purchase",
  );
  expect(state.record.planId).toBe("plus_monthly");
});

test("an ended subscription never overwrites a paid lifetime plan", async () => {
  Object.assign(state.record, lifetimeRecord);
  state.subscriptions = [subscription("canceled", "pro_monthly")];
  await caller().status();
  expect(state.record).toMatchObject(lifetimeRecord);
});

test("a lifetime plan takes over again once a later subscription ends", async () => {
  state.record.planId = "max_monthly";
  state.subscriptions = [subscription("canceled", "max_monthly")];
  state.completedSessions = [
    {
      id: "cs_lifetime",
      mode: "payment",
      payment_status: "paid",
      metadata: { userId: "user", planId: "pro_lifetime" },
      payment_intent: {
        metadata: { priceId: "price_pro_lifetime" },
        latest_charge: { refunded: false, disputed: false },
      },
    },
  ];
  await caller().status();
  expect(state.record).toMatchObject({ ...lifetimeRecord, checkoutSessionId: "cs_lifetime" });
});

test("a refunded lifetime purchase is not restored", async () => {
  state.record.planId = "max_monthly";
  state.subscriptions = [subscription("canceled", "max_monthly")];
  state.completedSessions = [
    {
      id: "cs_lifetime",
      mode: "payment",
      payment_status: "paid",
      metadata: { userId: "user", planId: "pro_lifetime" },
      payment_intent: { metadata: {}, latest_charge: { refunded: true, disputed: false } },
    },
  ];
  await caller().status();
  expect(state.record).toMatchObject({ planId: "max_monthly", status: "inactive" });
});

test("the billed price decides the plan, not stale subscription metadata", async () => {
  state.subscriptions = [subscription("active", "plus_monthly", "max_monthly")];
  await caller().status();
  expect(state.record.planId).toBe("plus_monthly");
});
