import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  event: {} as Record<string, unknown>,
  subscriptions: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));
vi.mock("@/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));
vi.mock("@/lib/billing-card-usage", () => ({ getBillingFingerprintUpdates: vi.fn() }));
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
    subscriptions: { list: async () => ({ data: state.subscriptions }) },
  },
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(updates);
        },
      }),
    }),
  },
}));

const { POST } = await import("../src/app/api/stripe/webhook/route");

const meteredItems = {
  data: [
    { id: "si_basic", price: { lookup_key: "max_mode_basic_month" } },
    { id: "si_premium", price: { lookup_key: "max_mode_premium_month" } },
  ],
};

function deleteMeterSubscription() {
  state.event = {
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_meter",
        object: "subscription",
        customer: "customer",
        metadata: { purpose: "max_mode", userId: "user" },
        items: meteredItems,
      },
    },
  };
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

beforeEach(() => {
  state.subscriptions = [];
  state.updates = [];
});

test("canceling the Max Mode meter subscription turns Max Mode off", async () => {
  expect((await deleteMeterSubscription()).status).toBe(200);
  expect(state.updates).toEqual([
    expect.objectContaining({
      maxModeEnabled: false,
      stripeMeteredBasicItemId: null,
      stripeMeteredPremiumItemId: null,
    }),
  ]);
});

test("a replaced meter host keeps Max Mode on while meters live elsewhere", async () => {
  state.subscriptions = [{ id: "sub_new_meter", status: "active", items: meteredItems }];
  expect((await deleteMeterSubscription()).status).toBe(200);
  expect(state.updates).toEqual([]);
});
