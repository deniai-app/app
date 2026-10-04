import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { consumeUsage, refundUsage } from "./usage";

const state = vi.hoisted(() => ({
  database: {} as Record<string, unknown>,
  used: 300_000_000 - 10,
  exists: true,
  maxModeEnabled: true,
  unit: "tokens",
  ledger: 0,
  team: false,
  cap: 20,
  failQuota: false,
  failLedger: false,
  locks: 0,
  writes: [] as string[],
}));
vi.mock("@/db/drizzle", () => ({
  db: new Proxy({}, { get: (_target, key) => state.database[key as string] }),
}));
vi.mock("./stripe", () => ({ stripe: {} }));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));

const dialect = new PgDialect();
const now = new Date("2026-06-01T00:00:00Z");
const limit = 300_000_000;

function database() {
  let tail = Promise.resolve();
  return {
    transaction: async (run: (transaction: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "read committed" });
      let release: (() => void) | undefined;
      let snapshot: { used: number; ledger: number; exists: boolean; unit: string } | undefined;
      const checkLock = () =>
        expect(snapshot, "all usage reads and writes must follow the account lock").toBeDefined();
      const transaction = {
        execute: async (statement: SQL) => {
          expect(dialect.sqlToQuery(statement).sql).toContain('FROM "user"');
          expect(dialect.sqlToQuery(statement).sql).toContain("FOR UPDATE");
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          snapshot = {
            used: state.used,
            ledger: state.ledger,
            exists: state.exists,
            unit: state.unit,
          };
          state.locks++;
          return [{ id: "user" }];
        },
        select: () => ({
          from: (table: Parameters<typeof getTableName>[0]) => {
            let joined = false;
            const query = {
              innerJoin: () => {
                joined = true;
                return query;
              },
              where: () => {
                checkLock();
                const name = getTableName(table);
                let rows: Record<string, unknown>[] = [];
                const personal = {
                  id: "personal",
                  organizationId: null,
                  planId: "pro_monthly",
                  status: "active",
                  maxModeEnabled: state.maxModeEnabled,
                  maxModeUsageBasic: state.ledger,
                  maxModeUsagePremium: 0,
                };
                if (name === "billing") {
                  rows = joined
                    ? state.team
                      ? [
                          {
                            ...personal,
                            id: "team-billing",
                            organizationId: "team",
                            planId: "pro_team_monthly",
                          },
                        ]
                      : []
                    : [personal];
                }
                if (name === "usage_quota" && state.exists)
                  rows = [
                    {
                      used: state.used,
                      unit: state.unit,
                      periodStart: now,
                      periodEnd: state.unit === "requests" ? null : new Date("2026-07-01"),
                    },
                  ];
                if (name === "team_member_usage_policy")
                  rows = [
                    {
                      maxModeEnabled: true,
                      maxModeLimitBasic: state.cap,
                      maxModeLimitPremium: state.cap,
                    },
                  ];
                const result = Promise.resolve(rows);
                return Object.assign(result, { limit: () => result });
              },
            };
            return query;
          },
        }),
        insert: () => ({
          values: (values: { used: number; unit: string }) => ({
            onConflictDoUpdate: () => ({
              returning: async () => {
                checkLock();
                if (state.failQuota) throw new Error("Quota write failed");
                state.used =
                  state.exists && state.unit === values.unit
                    ? state.used + values.used
                    : values.used;
                state.exists = true;
                state.unit = values.unit;
                state.writes.push("quota");
                return [{ used: state.used }];
              },
            }),
          }),
        }),
        update: (table: Parameters<typeof getTableName>[0]) => ({
          set: (fields: Record<string, SQL>) => ({
            where: () => ({
              returning: async () => {
                checkLock();
                const quota = getTableName(table) === "usage_quota";
                const expression = quota ? fields.used : fields.maxModeUsageBasic;
                const { sql, params } = dialect.sqlToQuery(expression);
                const amount = Number(params[0]);
                if (quota) {
                  if (state.failQuota) throw new Error("Quota write failed");
                  state.used = Math.max(state.used - amount, 0);
                  state.writes.push("quota");
                  return [{ used: state.used }];
                }
                if (state.failLedger) return [];
                state.ledger = sql.includes("GREATEST")
                  ? Math.max(state.ledger - amount, 0)
                  : state.ledger + amount;
                state.writes.push("ledger");
                return [{ maxModeUsageBasic: state.ledger, maxModeUsagePremium: 0 }];
              },
            }),
          }),
        }),
      };
      try {
        return await run(transaction);
      } catch (error) {
        if (snapshot) Object.assign(state, snapshot);
        throw error;
      } finally {
        release?.();
      }
    },
  };
}

beforeEach(() => {
  state.used = limit - 10;
  state.exists = true;
  state.maxModeEnabled = true;
  state.unit = "tokens";
  state.ledger = 0;
  state.team = false;
  state.cap = 20;
  state.failQuota = false;
  state.failLedger = false;
  state.locks = 0;
  state.writes = [];
  state.database = database();
});

const consume = (amount: number) =>
  consumeUsage({ userId: "user", category: "basic", amount, now });
const refund = (amount: number) => refundUsage({ userId: "user", category: "basic", amount, now });

test("parallel consumes accurately bill the free/Max Mode boundary", async () => {
  const results = await Promise.all([consume(20), consume(20)]);
  expect(state.used - limit).toBe(30);
  expect(state.ledger).toBe(30);
  expect(results.reduce((sum, result) => sum + result.maxModeAmount, 0)).toBe(30);
  expect(state.locks).toBe(2);
});

test("parallel team consumes cannot exceed a member's Max Mode cap", async () => {
  state.team = true;
  state.used = limit;
  const results = await Promise.allSettled([consume(20), consume(20)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(state.used - limit).toBe(20);
  expect(state.ledger).toBe(20);
});

test("only the above-limit slice counts toward a member cap", async () => {
  state.team = true;
  state.cap = 15;
  expect((await consume(20)).maxModeAmount).toBe(10);
  expect(state.ledger).toBe(10);
});

test("parallel refunds do not refund the same overage twice", async () => {
  state.used = limit + 10;
  state.ledger = 10;
  const results = await Promise.all([refund(10), refund(10)]);
  expect(state.used).toBe(limit - 10);
  expect(state.ledger).toBe(0);
  expect(results.reduce((sum, result) => sum + result.maxModeRefunded, 0)).toBe(10);
});

test("consume and refund share one serialization boundary", async () => {
  state.used = limit + 10;
  state.ledger = 10;
  await Promise.all([consume(10), refund(10)]);
  expect(state.used).toBe(limit + 10);
  expect(state.ledger).toBe(10);
  expect(state.locks).toBe(2);
});

test("a failed quota write rolls back the Max Mode ledger", async () => {
  state.failQuota = true;
  await expect(consume(20)).rejects.toThrow("Quota write failed");
  expect(state.used).toBe(limit - 10);
  expect(state.ledger).toBe(0);
});

test("a failed ledger refund rolls back the quota refund", async () => {
  state.used = limit + 10;
  state.ledger = 10;
  state.failLedger = true;
  await expect(refund(10)).rejects.toThrow("Unable to refund");
  expect(state.used).toBe(limit + 10);
  expect(state.ledger).toBe(10);
});

test("empty guest quotas are protected by the account lock", async () => {
  state.exists = false;
  state.maxModeEnabled = false;
  state.used = 0;
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      consumeUsage({ userId: "user", category: "basic", amount: 30, isAnonymous: true, now }),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(state.used).toBe(30);
  expect(state.unit).toBe("requests");
  expect(state.locks).toBe(2);
});

test("settling past a member cap records the quota but bills only up to the cap", async () => {
  state.team = true;
  state.used = limit + 15;
  state.ledger = 15;
  const result = await consumeUsage({
    userId: "user",
    category: "basic",
    amount: 20,
    allowLimitOverflow: true,
    now,
  });
  expect(result.maxModeAmount).toBe(5);
  expect(state.used - limit).toBe(35);
  expect(state.ledger).toBe(20);
});

test("settling once the member cap is exhausted bills nothing more", async () => {
  state.team = true;
  state.used = limit + 20;
  state.ledger = 20;
  const result = await consumeUsage({
    userId: "user",
    category: "basic",
    amount: 20,
    allowLimitOverflow: true,
    now,
  });
  expect(result.maxModeAmount).toBe(0);
  expect(state.used - limit).toBe(40);
  expect(state.ledger).toBe(20);
});
