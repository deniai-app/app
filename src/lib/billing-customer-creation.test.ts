import { AsyncLocalStorage } from "node:async_hooks";
import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { billingRouter } from "@/server/api/routers/billing";
import { organizationRouter } from "@/server/api/routers/organization";

const state = vi.hoisted(() => ({
  locked: 0,
  rows: [] as Record<string, unknown>[],
  customers: new Map<string, { id: string }>(),
  search: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/team-billing", () => ({
  getOrgMemberCount: async () => 1,
  updateTeamSeatCount: vi.fn(),
}));
vi.mock("@/lib/billing-trials", () => ({ isTrialEligibleForCustomer: async () => false }));
vi.mock("@/lib/billing-card-usage", () => ({
  getCustomerPrimaryCardFingerprint: async () => null,
  isTrialFingerprintEligible: async () => false,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { search: state.search, create: state.create },
    prices: { list: async () => ({ data: [] }) },
    paymentIntents: {
      create: async () => {
        expect(scope.getStore()).not.toBe(true);
        return { id: "intent", client_secret: "secret" };
      },
    },
  },
}));

const scope = new AsyncLocalStorage<boolean>();

function database() {
  let tail = Promise.resolve();
  const database = {
    execute: async () => {},
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => {
          const name = getTableName(table);
          if (name === "user")
            expect(scope.getStore(), "profile uses an unlocked pooled read").not.toBe(true);
          const rows =
            name === "user"
              ? [{ email: "owner@outlook.com", name: "Owner" }]
              : name === "member"
                ? [{ organizationId: "team", role: "owner", userId: "owner" }]
                : state.rows.map((row) => ({ ...row }));
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const returning = async () => {
          expect(state.locked).toBe(1);
          const row = { id: "billing-row", ...values };
          state.rows.push(row);
          return [row];
        };
        return { returning, onConflictDoNothing: () => ({ returning }) };
      },
    }),
    transaction: async (run: (transaction: unknown) => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      state.locked++;
      try {
        return await scope.run(true, () => run(database));
      } finally {
        state.locked--;
        release();
      }
    },
  };
  return database;
}
const context = (db: ReturnType<typeof database>) =>
  ({
    db,
    session: { session: { userId: "owner" }, user: { isAnonymous: false, emailVerified: true } },
  }) as never;

beforeEach(() => {
  state.locked = 0;
  state.rows = [];
  state.customers.clear();
  state.search.mockReset().mockImplementation(async () => {
    expect(scope.getStore(), "Stripe search runs outside a transaction").not.toBe(true);
    return { data: [] };
  });
  state.create
    .mockReset()
    .mockImplementation(async (_params, options: { idempotencyKey: string }) => {
      expect(scope.getStore(), "Stripe create runs outside a transaction").not.toBe(true);
      const key = options.idempotencyKey;
      if (!state.customers.has(key)) state.customers.set(key, { id: "customer" });
      return state.customers.get(key);
    });
});

test.each(["personal", "team"])(
  "eight concurrent %s creators share one customer and billing row",
  async (kind) => {
    const db = database();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        kind === "personal"
          ? billingRouter.createCaller(context(db)).createCardSetupIntent()
          : organizationRouter.createCaller(context(db)).teamPlans(),
      ),
    );
    expect(state.customers.size).toBe(1);
    expect([...state.customers.keys()]).toEqual([
      kind === "personal" ? "billing-personal-owner" : "billing-team-team",
    ]);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].stripeCustomerId).toBe("customer");
  },
);

test("team search errors do not create another customer", async () => {
  state.search.mockRejectedValue(new Error("Stripe search unavailable"));
  await expect(organizationRouter.createCaller(context(database())).teamPlans()).rejects.toThrow(
    "Stripe search unavailable",
  );
  expect(state.create).not.toHaveBeenCalled();
  expect(state.rows).toHaveLength(0);
});
