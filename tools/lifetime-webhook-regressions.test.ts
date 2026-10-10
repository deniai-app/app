import { beforeEach, expect, test, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  event: {} as Record<string, unknown>,
  completedSessions: [] as Record<string, unknown>[],
  /** What Stripe returns when the webhook reads the subscription; defaults to the event's own copy. */
  currentSubscription: null as Record<string, unknown> | null,
  replacementDuringLookup: false,
  replacementDuringLineItems: false,
  reversed: false,
}));
vi.mock("@/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));
vi.mock("@/lib/billing-card-usage", () => ({
  getBillingFingerprintUpdates: async () => ({ paymentMethodFingerprint: "fp" }),
}));
vi.mock("@/lib/ad-checkout", () => ({
  activatePaidAd: vi.fn(),
  pauseReversedAdCharge: vi.fn(),
  releaseExpiredAdCheckout: vi.fn(),
}));
vi.mock("@/lib/max-mode", () => ({ syncMaxModeMeterPeriod: vi.fn() }));
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
    // The webhook reads the live subscription instead of trusting the event's snapshot.
    subscriptions: {
      retrieve: async () =>
        state.currentSubscription ?? (state.event.data as { object: unknown }).object,
    },
    checkout: {
      sessions: {
        list: async () => {
          if (state.replacementDuringLookup) state.record.stripeSubscriptionId = "sub_new";
          return { data: state.completedSessions };
        },
        retrieve: async () => ({
          ...paidLifetimeSession,
          payment_intent: { latest_charge: { refunded: state.reversed, disputed: false } },
        }),
        listLineItems: async () => {
          if (state.replacementDuringLineItems)
            Object.assign(state.record, {
              stripeSubscriptionId: "sub_new",
              planId: "max_monthly",
              status: "active",
            });
          return { data: [{ price: { id: "price_pro_lifetime" } }] };
        },
      },
    },
  },
}));
vi.mock("@/db/drizzle", () => {
  const matches = (condition?: SQL) => {
    if (!condition) return true;
    const query = new PgDialect().sqlToQuery(condition);
    for (const match of query.sql.matchAll(/"([a-z_]+)" (?:IS NOT DISTINCT FROM|=) \$(\d+)/g)) {
      const key = match[1].replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      const actual = state.record[key] ?? null;
      const expected = query.params[Number(match[2]) - 1] ?? null;
      if (actual instanceof Date ? actual.toISOString() !== expected : actual !== expected)
        return false;
    }
    return true;
  };
  const result = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    return Object.assign(promise, { limit: () => promise });
  };
  return {
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run((await import("@/db/drizzle")).db),
      execute: async () => {},
      update: () => ({
        set: (updates: Record<string, unknown>) => ({
          where: (condition: SQL) => {
            const applied = Promise.resolve().then(() => {
              if (!matches(condition)) return [];
              Object.assign(state.record, updates);
              return [{ ...state.record }];
            });
            return Object.assign(applied, { returning: () => applied });
          },
        }),
      }),
      select: () => ({ from: () => ({ where: () => result([{ ...state.record }]) }) }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: ({
            set,
            setWhere,
          }: {
            set: Record<string, unknown>;
            setWhere?: SQL;
          }) => {
            const applied = Promise.resolve().then(() => {
              if (!matches(setWhere)) return [];
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
  state.currentSubscription = null;
  state.replacementDuringLookup = false;
  state.replacementDuringLineItems = false;
  state.reversed = false;
});

test.each([false, true])(
  "an old deletion cannot clear a replacement subscription (lifetime=%s)",
  async (lifetime) => {
    Object.assign(state.record, {
      stripeSubscriptionId: "sub_new",
      planId: "max_monthly",
      status: "active",
      mode: "subscription",
    });
    if (lifetime) state.completedSessions = [paidLifetimeSession];
    state.event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          object: "subscription",
          id: "sub_old",
          customer: "customer",
          metadata: { userId: "user" },
          items: { data: [] },
        },
      },
    };
    expect((await deliver()).status).toBe(200);
    expect(state.record).toMatchObject({
      stripeSubscriptionId: "sub_new",
      planId: "max_monthly",
      status: "active",
    });
  },
);

test("a subscription replaced during lifetime lookup is protected by the conditional write", async () => {
  Object.assign(state.record, {
    stripeSubscriptionId: "sub_old",
    planId: "max_monthly",
    status: "active",
  });
  state.replacementDuringLookup = true;
  state.completedSessions = [paidLifetimeSession];
  state.event = {
    type: "customer.subscription.deleted",
    data: {
      object: {
        object: "subscription",
        id: "sub_old",
        customer: "customer",
        metadata: { userId: "user" },
        items: { data: [] },
      },
    },
  };
  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({ stripeSubscriptionId: "sub_new", status: "active" });
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

test("a stale subscription event cannot undo a newer cancellation", async () => {
  const subscription = {
    id: "sub",
    object: "subscription",
    customer: "customer",
    metadata: { userId: "user", planId: "max_monthly" },
    items: {
      data: [{ current_period_end: 1_900_000_000, price: { lookup_key: "max_monthly" } }],
    },
  };
  Object.assign(state.record, { stripeSubscriptionId: "sub", planId: "max_monthly" });
  // The delayed event still says active; Stripe already knows the subscription ended.
  state.event = {
    type: "customer.subscription.updated",
    data: { object: { ...subscription, status: "active" } },
  };
  state.currentSubscription = { ...subscription, status: "canceled" };

  expect((await deliver()).status).toBe(200);
  expect(state.record).toMatchObject({ status: "inactive" });
});

test("a refunded checkout cannot activate a lifetime plan even if its completion event is delayed", async () => {
  state.reversed = true;
  state.event = { type: "checkout.session.completed", data: { object: paidLifetimeSession } };
  expect((await deliver()).status).toBe(200);
  expect(state.record.status).toBe("inactive");
});
test("a lifetime webhook cannot overwrite a contract activated during Stripe lookup", async () => {
  state.replacementDuringLineItems = true;
  state.event = { type: "checkout.session.completed", data: { object: paidLifetimeSession } };
  expect((await deliver()).status).toBe(200);
  expect(state.record.stripeSubscriptionId).toBe("sub_new");
});
test("a lifetime refund revokes only the affected checkout", async () => {
  Object.assign(state.record, {
    mode: "payment",
    status: "paid",
    planId: "pro_lifetime",
    checkoutSessionId: "cs_lifetime",
  });
  state.completedSessions = [paidLifetimeSession];
  state.event = { type: "charge.refunded", data: { object: { payment_intent: "intent" } } };
  expect((await deliver()).status).toBe(200);
  expect(state.record.status).toBe("inactive");
});
test("a refund for an old lifetime checkout preserves a newer subscription", async () => {
  Object.assign(state.record, {
    stripeSubscriptionId: "sub_new",
    mode: "subscription",
    status: "active",
    planId: "max_monthly",
    checkoutSessionId: "cs_new",
  });
  state.completedSessions = [paidLifetimeSession];
  state.event = { type: "charge.refunded", data: { object: { payment_intent: "intent" } } };
  expect((await deliver()).status).toBe(200);
  expect(state.record.stripeSubscriptionId).toBe("sub_new");
  expect(state.record.status).toBe("active");
});
