import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type Stripe from "stripe";
import { beforeEach, expect, test, vi } from "vitest";
import { enableMaxMode, syncMaxModeMeterPeriod } from "./max-mode";
import type { billing } from "@/db/schema";
const state = vi.hoisted(() => ({
  record: {} as typeof billing.$inferSelect,
  receipts: [] as { billingId: string; category: string; createdAt: Date; maxModeAmount: number }[],
  onLock: null as (() => void) | null,
}));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));
vi.mock("./max-mode-stripe", () => ({
  attachMaxModeMeteredItems: async () => ({
    ok: true,
    subscriptionId: "licensed-year",
    basicItemId: "meter-basic",
    premiumItemId: "meter-premium",
  }),
  getMaxModeBillingCurrency: async () => "usd",
  getMaxModePriceAmounts: async () => ({}),
}));
vi.mock("./max-mode-meter-events", () => ({
  enqueueMaxModeMeterEvent: vi.fn(),
  deliverMaxModeMeterEvents: vi.fn(),
}));
vi.mock("./stripe", () => ({ stripe: {} }));
vi.mock("@/db/drizzle", () => {
  const database = {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        innerJoin: () => ({ where: async () => [] }),
        where: (condition: SQL) => {
          if (getTableName(table) === "usage_reservation") {
            const query = new PgDialect().sqlToQuery(condition);
            const start = new Date(query.params.at(-1) as string);
            const receipts = state.receipts.filter(
              (receipt) => query.params.includes(receipt.billingId) && receipt.createdAt >= start,
            );
            return Promise.resolve([
              {
                basic: receipts
                  .filter((receipt) => receipt.category === "basic")
                  .reduce((sum, receipt) => sum + receipt.maxModeAmount, 0),
                premium: receipts
                  .filter((receipt) => receipt.category === "premium")
                  .reduce((sum, receipt) => sum + receipt.maxModeAmount, 0),
              },
            ]);
          }
          return {
            limit: async () => [{ ...state.record }],
            for: async () => {
              state.onLock?.();
              const query = new PgDialect().sqlToQuery(condition);
              if (
                !query.params.includes(state.record.stripeMeteredBasicItemId) &&
                !query.params.includes(state.record.stripeMeteredPremiumItemId)
              )
                return [];
              if (
                state.record.maxModePeriodStart &&
                state.record.maxModePeriodStart >= new Date(query.params.at(-1) as string)
              )
                return [];
              return [{ ...state.record }];
            },
          };
        },
      }),
    }),
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: async (condition: SQL) => {
          const query = new PgDialect().sqlToQuery(condition);
          if (query.sql.includes('"stripe_metered_basic_item_id" in')) {
            if (
              !query.params.includes(state.record.stripeMeteredBasicItemId) &&
              !query.params.includes(state.record.stripeMeteredPremiumItemId)
            )
              return;
            const next = new Date(query.params.at(-1) as string);
            if (state.record.maxModePeriodStart && state.record.maxModePeriodStart >= next) return;
          }
          for (const [key, value] of Object.entries(updates)) {
            Object.assign(state.record, {
              [key]:
                value instanceof SQL
                  ? (state.record.maxModePeriodStart ??
                    new Date(new PgDialect().sqlToQuery(value).params[0] as string))
                  : value,
            });
          }
        },
      }),
    }),
  };
  return {
    db: {
      ...database,
      transaction: async (run: (tx: typeof database) => Promise<unknown>) => run(database),
    },
  };
});
beforeEach(() => {
  state.receipts = [];
  state.onLock = null;
  state.record = {
    id: "record",
    organizationId: null,
    planId: "pro_yearly",
    status: "active",
    stripeCustomerId: "customer",
    stripeSubscriptionId: "licensed-year",
    stripeMeteredBasicItemId: "meter-basic",
    stripeMeteredPremiumItemId: "meter-premium",
    maxModeEnabled: false,
    maxModeUsageBasic: 123,
    maxModeUsagePremium: 45,
    maxModePeriodStart: new Date("2026-06-01"),
    deletionPending: false,
  } as typeof billing.$inferSelect;
});
const meterHost = (start: string, id = "meter-basic") =>
  ({
    status: "active",
    id: "monthly-meter-host",
    metadata: { purpose: "max_mode" },
    items: {
      data: [
        {
          id,
          current_period_start: new Date(start).getTime() / 1000,
          price: { lookup_key: "max_mode_basic_month" },
        },
      ],
    },
  }) as unknown as Stripe.Subscription;
test("re-enabling Max Mode preserves billed usage and its period", async () => {
  expect(await enableMaxMode("user")).toEqual({ success: true });
  expect(state.record.maxModeUsageBasic).toBe(123);
  expect(state.record.maxModeUsagePremium).toBe(45);
  expect(state.record.maxModePeriodStart).toEqual(new Date("2026-06-01"));
});
test("a yearly plan's monthly meter host resets its own ledger", async () => {
  await syncMaxModeMeterPeriod(meterHost("2026-07-01"));
  expect(state.record.maxModeUsageBasic).toBe(0);
  expect(state.record.maxModePeriodStart).toEqual(new Date("2026-07-01"));
});
test("duplicate or delayed monthly events never erase newer usage", async () => {
  await syncMaxModeMeterPeriod(meterHost("2026-07-01"));
  state.record.maxModeUsageBasic = 99;
  await syncMaxModeMeterPeriod(meterHost("2026-07-01"));
  await syncMaxModeMeterPeriod(meterHost("2026-06-01"));
  expect(state.record.maxModeUsageBasic).toBe(99);
});
test("a meter host cannot reset an unrelated team's ledger", async () => {
  await syncMaxModeMeterPeriod(meterHost("2026-07-01", "another-teams-item"));
  expect(state.record.maxModeUsageBasic).toBe(123);
});
test("deletion freeze prevents enabling a new meter host", async () => {
  state.record.deletionPending = true;
  expect((await enableMaxMode("user")).success).toBe(false);
});

test("a delayed renewal preserves usage already settled in the new meter period", async () => {
  state.receipts = [
    {
      billingId: "record",
      category: "basic",
      createdAt: new Date("2026-07-02"),
      maxModeAmount: 17,
    },
    {
      billingId: "record",
      category: "premium",
      createdAt: new Date("2026-07-02"),
      maxModeAmount: 23,
    },
    {
      billingId: "record",
      category: "basic",
      createdAt: new Date("2026-06-30"),
      maxModeAmount: 100,
    },
    {
      billingId: "another-team",
      category: "basic",
      createdAt: new Date("2026-07-02"),
      maxModeAmount: 100,
    },
  ];
  await syncMaxModeMeterPeriod(meterHost("2026-07-01"));
  expect(state.record.maxModeUsageBasic).toBe(17);
  expect(state.record.maxModeUsagePremium).toBe(23);
});

test("renewal reads receipts committed while waiting for the billing lock", async () => {
  state.onLock = () => {
    state.receipts.push({
      billingId: "record",
      category: "basic",
      createdAt: new Date("2026-07-02"),
      maxModeAmount: 9,
    });
    state.record.maxModeUsageBasic += 9;
  };
  await syncMaxModeMeterPeriod(meterHost("2026-07-01"));
  expect(state.record.maxModeUsageBasic).toBe(9);
});
