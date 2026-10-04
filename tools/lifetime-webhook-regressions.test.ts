import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  event: {} as Record<string, unknown>,
  completedSessions: [] as Record<string, unknown>[],
}));
vi.mock("@/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));
vi.mock("@/lib/billing-card-usage", () => ({
  getBillingFingerprintUpdates: async () => ({ paymentMethodFingerprint: "fp" }),
}));
vi.mock("@/lib/affiliate", () => ({
  isAffiliatePaidStatus: () => false,
  processAffiliatePurchase: vi.fn(),
}));
vi.mock("@/lib/ad-checkout", () => ({
  activatePaidAd: vi.fn(),
  pauseReversedAdCharge: vi.fn(),
  releaseExpiredAdCheckout: vi.fn(),
}));
vi.mock("@/lib/max-mode", () => ({ resetMaxModeUsage: vi.fn() }));
vi.mock("@/lib/stripe-disputes", () => ({
  handleChargeDisputeClosed: vi.fn(),
  handleChargeDisputeCreated: vi.fn(),
  handleEarlyFraudWarning: vi.fn(),
}));
vi.mock("@/lib/team-billing", () => ({
  cancelOrgMembersPersonalSubscriptions: vi.fn(),
  getTeamBilling: vi.fn(),
  recordTeamAuditEvent: vi.fn(),
}));
vi.mock("@/lib/team-billing-record", () => ({ saveTeamBillingRecord: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: () => state.event },
    customers: { retrieve: async () => ({ metadata: { userId: "user" } }) },
    checkout: {
      sessions: {
        list: async () => ({ data: state.completedSessions }),
        listLineItems: async () => ({ data: [{ price: { id: "price_pro_lifetime" } }] }),
      },
    },
  },
}));
vi.mock("@/db/drizzle", () => {
  const result = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    return Object.assign(promise, { limit: () => promise });
  };
  return {
    db: {
      select: () => ({ from: () => ({ where: () => result([state.record]) }) }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            const applied = Promise.resolve().then(() => {
              Object.assign(state.record, set);
              return [state.record];
            });
            return Object.assign(applied, { returning: () => applied });
          },
        }),
      }),
    },
  };
});

const { POST } = await import("../src/app/api/stripe/webhook/route");

function deliver() {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

const paidLifetimeSession = {
  id: "cs_lifetime",
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  customer: "customer",
  client_reference_id: "user",
  metadata: { userId: "user", planId: "pro_lifetime" },
  payment_intent: {
    metadata: { priceId: "price_pro_lifetime" },
    latest_charge: { refunded: false, disputed: false },
  },
};

beforeEach(() => {
  state.record = {
    userId: "user",
    stripeCustomerId: "customer",
    stripeSubscriptionId: null,
    planId: null,
    status: "inactive",
    mode: "subscription",
    firstPaidAt: null,
  };
  state.completedSessions = [];
});

test("a paid lifetime checkout is activated without the buyer returning", async () => {
  state.event = {
    type: "checkout.session.completed",
    created: 1_900_000_000,
    data: { object: paidLifetimeSession },
  };
  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({
    planId: "pro_lifetime",
    priceId: "price_pro_lifetime",
    status: "paid",
    mode: "payment",
    checkoutSessionId: "cs_lifetime",
  });
});

test("a lifetime checkout does not displace a live subscription", async () => {
  Object.assign(state.record, {
    stripeSubscriptionId: "sub",
    planId: "max_monthly",
    status: "active",
  });
  state.event = {
    type: "checkout.session.completed",
    created: 1_900_000_000,
    data: { object: paidLifetimeSession },
  };
  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({ planId: "max_monthly", status: "active" });
});

test("a deleted subscription hands the row back to a paid lifetime plan", async () => {
  Object.assign(state.record, {
    stripeSubscriptionId: "sub",
    planId: "max_monthly",
    status: "active",
    firstPaidAt: new Date(),
  });
  state.completedSessions = [paidLifetimeSession];
  state.event = {
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub",
        object: "subscription",
        customer: "customer",
        metadata: { userId: "user", planId: "max_monthly" },
        items: { data: [{ price: { lookup_key: "max_monthly" } }] },
      },
    },
  };
  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({
    planId: "pro_lifetime",
    status: "paid",
    mode: "payment",
    stripeSubscriptionId: null,
  });
});

test("an incomplete subscription never replaces a paid lifetime plan", async () => {
  Object.assign(state.record, {
    planId: "pro_lifetime",
    status: "paid",
    mode: "payment",
    firstPaidAt: new Date(),
  });
  state.event = {
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub",
        object: "subscription",
        customer: "customer",
        status: "incomplete",
        metadata: { userId: "user", planId: "max_monthly" },
        items: {
          data: [{ current_period_end: 1_900_000_000, price: { lookup_key: "max_monthly" } }],
        },
      },
    },
  };
  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({ planId: "pro_lifetime", status: "paid" });
});
