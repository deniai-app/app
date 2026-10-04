import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { billingRouter } from "@/server/api/routers/billing";
import { organizationRouter } from "@/server/api/routers/organization";
import { claimCardVerification } from "@/lib/billing-card-usage";

const state = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  subscription: {} as Record<string, unknown>,
  update: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/team-billing", () => ({
  getOrgMemberCount: vi.fn(async () => 2),
  updateTeamSeatCount: vi.fn(),
}));
vi.mock("@/lib/billing-card-usage", () => ({
  claimCardVerification: vi.fn(),
  getBillingFingerprintUpdates: vi.fn(),
  getCustomerPrimaryCardInfo: vi.fn(),
  getCustomerPrimaryCardFingerprint: vi.fn(),
  isTrialFingerprintEligible: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: {
      list: async () => ({
        data: [{ id: "higher-price", recurring: { interval: "month" }, lookup_key: "pro_monthly" }],
      }),
    },
    subscriptions: {
      list: async () => ({ data: [state.subscription] }),
      retrieve: async () => state.subscription,
      update: state.update,
    },
    paymentIntents: { retrieve: state.intent },
  },
}));

function database() {
  const database = {
    execute: async () => {},
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => {
          const rows =
            getTableName(table) === "member" ? [{ role: "owner", userId: "user" }] : [state.record];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
    insert: () => ({
      values: (updates: Record<string, unknown>) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            Object.assign(state.record, updates);
            return [state.record];
          },
        }),
      }),
    }),
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            Object.assign(state.record, updates);
            return [state.record];
          },
        }),
      }),
    }),
    transaction: async (run: (transaction: unknown) => Promise<unknown>) => run(database),
  };
  return database;
}
function context() {
  return {
    db: database(),
    session: { session: { userId: "user" }, user: { isAnonymous: false, emailVerified: true } },
    userId: "user",
  } as never;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.record = {
    id: "row",
    userId: "user",
    stripeCustomerId: "customer",
    stripeSubscriptionId: "sub",
    planId: "plus_monthly",
    status: "active",
    firstPaidAt: new Date(),
    maxModeEnabled: false,
  };
  state.subscription = {
    id: "sub",
    customer: "customer",
    status: "active",
    metadata: { planId: "plus_monthly" },
    items: {
      data: [
        {
          id: "item",
          price: {
            id: "lower-price",
            lookup_key: "plus_monthly",
            recurring: { interval: "month" },
          },
        },
      ],
    },
  };
  state.update.mockRejectedValue(new Error("Payment incomplete"));
});
test("failed personal upgrade requests restrictive Stripe payment behavior and retains the paid tier", async () => {
  await expect(
    billingRouter.createCaller(context()).changePlan({ planId: "pro_monthly" }),
  ).rejects.toThrow("Payment incomplete");
  expect(state.update).toHaveBeenCalledWith(
    "sub",
    expect.objectContaining({
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    }),
  );
  expect(state.record.planId).toBe("plus_monthly");
});
test("failed team upgrade retains the original team tier", async () => {
  state.record.planId = "pro_team_monthly";
  state.record.organizationId = "team";
  state.subscription.metadata = { planId: "pro_team_monthly" };
  state.subscription.items = {
    data: [
      {
        id: "item",
        price: {
          id: "team-price",
          lookup_key: "pro_team_monthly",
          recurring: { interval: "month" },
        },
      },
    ],
  };
  await expect(
    organizationRouter
      .createCaller(context())
      .changeTeamPlan({ organizationId: "team", planId: "max_team_monthly" }),
  ).rejects.toThrow("Payment incomplete");
  expect(state.update).toHaveBeenCalledWith(
    "sub",
    expect.objectContaining({ payment_behavior: "error_if_incomplete" }),
  );
  expect(state.record.planId).toBe("pro_team_monthly");
});
test.each([
  { userId: "other", purpose: "free_tier_verification", customer: "customer" },
  { userId: "user", purpose: "advertisement", customer: "customer" },
  { userId: "user", purpose: "free_tier_verification", customer: "other-customer" },
  { purpose: "free_tier_verification", customer: "customer" },
])(
  "card confirmation rejects foreign or wrong-purpose intents: %j",
  async ({ customer, ...metadata }) => {
    state.intent.mockResolvedValue({ customer, metadata, status: "requires_capture" });
    await expect(
      billingRouter.createCaller(context()).confirmCardSetup({ paymentIntentId: "intent" }),
    ).rejects.toThrow("does not belong");
    expect(claimCardVerification).not.toHaveBeenCalled();
  },
);
