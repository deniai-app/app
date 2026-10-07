import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { organizationRouter } from "@/server/api/routers/organization";
import { updateTeamSeatCount } from "@/lib/team-billing";
import { stripe } from "@/lib/stripe";
import { db } from "@/db/drizzle";

const state = vi.hoisted(() => ({
  members: 2,
  quantity: 2,
  duringRetrieve: undefined as (() => void) | undefined,
  record: {} as Record<string, unknown>,
  subscription: () => ({
    id: "subscription",
    customer: "customer",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { planId: "pro_team_monthly" },
    items: {
      data: [
        {
          id: "licensed",
          quantity: state.quantity,
          current_period_end: 1_900_000_000,
          price: {
            id: "price_pro",
            lookup_key: "pro_team_monthly",
            recurring: { interval: "month" },
          },
        },
      ],
    },
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/usage", () => ({ getUsageLimitConfig: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: {
      list: async () => ({
        data: [
          { id: "price_max", lookup_key: "max_team_monthly", recurring: { interval: "month" } },
        ],
      }),
    },
    subscriptions: {
      list: async () => ({ data: [state.subscription()] }),
      retrieve: async () => {
        state.duringRetrieve?.();
        return state.subscription();
      },
      update: vi.fn(async () => state.subscription()),
    },
  },
}));
vi.mock("@/db/drizzle", () => {
  let tail = Promise.resolve();
  const database = {
    select: (fields?: { role?: unknown }) => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => {
          const rows =
            getTableName(table) === "member"
              ? fields?.role
                ? [{ role: "owner" }]
                : [{ count: state.members }]
              : [{ ...state.record }];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: (condition: SQL) => ({
          returning: async () => {
            const query = new PgDialect().sqlToQuery(condition);
            if (query.sql.includes("<>")) return [];
            for (const match of query.sql.matchAll(/"([a-z_]+)" IS NOT DISTINCT FROM \$(\d+)/g)) {
              const key = match[1].replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
              const actual = state.record[key] ?? null;
              const expected = query.params[Number(match[2]) - 1] ?? null;
              if (actual instanceof Date ? actual.toISOString() !== expected : actual !== expected)
                return [];
            }
            Object.assign(state.record, updates);
            return [{ ...state.record }];
          },
        }),
      }),
    }),
    insert: () => ({ values: async () => {} }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = {
        ...database,
        execute: async () => {
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
        },
      };
      try {
        return await run(tx);
      } finally {
        release?.();
      }
    },
  };
  return { db: database };
});
const caller = () =>
  organizationRouter.createCaller({
    db,
    session: { session: { userId: "owner" }, user: { isAnonymous: false, emailVerified: true } },
  } as never);
beforeEach(() => {
  vi.clearAllMocks();
  state.members = 2;
  state.quantity = 2;
  state.duringRetrieve = undefined;
  state.record = {
    id: "row",
    userId: "owner",
    organizationId: "team",
    stripeCustomerId: "customer",
    stripeSubscriptionId: "subscription",
    planId: "pro_team_monthly",
    priceId: "price_pro",
    mode: "subscription",
    status: "active",
    maxModeEnabled: false,
    currentPeriodEnd: null,
    cancelAt: null,
  };
});
test("a delayed plan change cannot overwrite the newer seat count", async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(stripe.subscriptions.update).mockImplementation(async (_id, params) => {
    if (params?.items?.[0].price) {
      started();
      await gate;
    }
    state.quantity = params?.items?.[0].quantity ?? 0;
    return state.subscription() as never;
  });
  const change = caller().changeTeamPlan({ organizationId: "team", planId: "max_team_monthly" });
  await ready;
  state.members = 3;
  const seats = updateTeamSeatCount("team");
  await Promise.resolve();
  await Promise.resolve();
  expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([change, seats]);
  expect(state.quantity).toBe(3);
});
test("an old team status query cannot replace a newly purchased contract", async () => {
  state.duringRetrieve = () =>
    Object.assign(state.record, {
      stripeSubscriptionId: "new-subscription",
      planId: "max_team_monthly",
    });
  await caller().teamBillingStatus({ organizationId: "team" });
  expect(state.record.stripeSubscriptionId).toBe("new-subscription");
  expect(state.record.planId).toBe("max_team_monthly");
});
