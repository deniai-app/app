import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import {
  deletePersonalStripeCustomers,
  getAccountDeletionStatus,
} from "./account-deletion-billing";
import { stripe } from "./stripe";

const state = vi.hoisted(() => ({
  metered: false,
  pendingUsage: false,
  pendingMeter: false,
  unpaid: false,
  canceled: false,
  frozen: false,
  race: false,
}));
vi.mock("@/env", () => ({ env: { STRIPE_SECRET_KEY: "test" } }));
vi.mock("@/db/drizzle", () => {
  const select = () => ({
    from: (table: Parameters<typeof getTableName>[0]) => ({
      where: () => {
        const name = getTableName(table);
        const rows =
          name === "usage_reservation" && state.pendingUsage
            ? [{ id: "pending" }]
            : name === "max_mode_meter_event" && state.pendingMeter
              ? [{ id: "meter" }]
              : [];
        const result = Promise.resolve(rows);
        return Object.assign(result, {
          limit: async () => (name === "billing" ? [{ customerId: "customer" }] : rows),
        });
      },
    }),
  });
  return {
    db: {
      select,
      transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run({
          select,
          execute: async () => {
            if (state.race) state.pendingUsage = true;
          },
          update: () => ({
            set: () => ({
              where: async () => {
                state.frozen = true;
              },
            }),
          }),
        }),
    },
  };
});
vi.mock("./stripe", () => ({
  stripe: {
    customers: {
      retrieve: async () => ({ id: "customer", metadata: { userId: "user" } }),
      search: async () => ({ data: [] }),
      del: vi.fn(async () => {
        expect(state.frozen).toBe(true);
        return {};
      }),
    },
    subscriptions: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            id: "subscription",
            status: state.canceled ? "canceled" : "active",
            cancel_at_period_end: true,
            cancel_at: null,
            items: {
              data: [
                {
                  price: { recurring: { usage_type: state.metered ? "metered" : "licensed" } },
                  current_period_end: 1_900_000_000,
                },
              ],
            },
          };
        },
      }),
      cancel: vi.fn(async () => {
        expect(state.frozen).toBe(true);
        state.canceled = true;
        return {};
      }),
    },
    invoices: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          if (state.unpaid) yield { id: "invoice", status: "open", amount_remaining: 100 };
        },
      }),
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    metered: false,
    pendingUsage: false,
    pendingMeter: false,
    unpaid: false,
    canceled: false,
    frozen: false,
    race: false,
  });
});
test("a metered cancellation waits for the natural final usage invoice", async () => {
  state.metered = true;
  expect((await getAccountDeletionStatus("user")).state).toBe("billingPending");
  await expect(deletePersonalStripeCustomers("user")).rejects.toThrow("Wait for usage billing");
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(stripe.customers.del).not.toHaveBeenCalled();
});
test.each(["pendingUsage", "pendingMeter", "unpaid"] as const)(
  "%s prevents deletion even after subscription cancellation",
  async (key) => {
    state[key] = true;
    state.canceled = true;
    await expect(deletePersonalStripeCustomers("user")).rejects.toThrow("Wait for usage billing");
    expect(stripe.customers.del).not.toHaveBeenCalled();
  },
);
test("a prepaid cancellation still allows immediate deletion without a refund", async () => {
  await deletePersonalStripeCustomers("user");
  expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("subscription", {
    prorate: false,
    invoice_now: false,
  });
  expect(stripe.customers.del).toHaveBeenCalledWith("customer");
});
test("a reservation created while checking Stripe is caught before freezing or deletion", async () => {
  state.race = true;
  await expect(deletePersonalStripeCustomers("user")).rejects.toThrow("Usage settlement");
  expect(state.frozen).toBe(false);
  expect(stripe.customers.del).not.toHaveBeenCalled();
});
