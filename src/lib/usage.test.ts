import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { consumeUsage, settleUsage, recordObservedUsage, recoverUsageReservations } from "./usage";
import type { usageReservation, usageQuota, billing, maxModeMeterEvent } from "@/db/schema";

type Reservation = typeof usageReservation.$inferSelect;
type Quota = typeof usageQuota.$inferSelect;
type Billing = typeof billing.$inferSelect;
type Event = typeof maxModeMeterEvent.$inferSelect;
const state = vi.hoisted(() => ({
  database: {} as Record<string, unknown>,
  quota: null as Quota | null,
  reservations: [] as Reservation[],
  events: [] as Event[],
  billings: [] as Billing[],
  team: null as string | null,
  cap: null as number | null,
  failQuota: false,
  failMeter: false,
  locks: 0,
}));
vi.mock("@/db/drizzle", () => ({
  db: new Proxy({}, { get: (_target, key) => state.database[key as string] }),
}));
vi.mock("./max-mode", () => ({
  isMaxModeEligible: () => true,
  deliverMaxModeUsageReport: vi.fn(async () => {}),
}));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));
vi.mock("./stripe", () => ({ stripe: {} }));
const dialect = new PgDialect();
const now = new Date("2026-06-01T00:00:00Z");
const limit = 300_000_000;
const field = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
function matches(row: object, condition: SQL): boolean {
  const values = row as Record<string, unknown>;
  const query = dialect.sqlToQuery(condition);
  for (const match of query.sql.matchAll(/"([a-z_]+)" (?:=|IS NOT DISTINCT FROM) \$(\d+)/g)) {
    const actual = values[field(match[1])] ?? null;
    const expected = query.params[Number(match[2]) - 1] ?? null;
    const same =
      actual instanceof Date
        ? actual.getTime() === new Date(expected as string).getTime()
        : actual === expected;
    if (!same) return false;
  }
  if (query.sql.includes('"settled_at" is null') && values.settledAt != null) return false;
  if (query.sql.includes('"period_end" IS NOT DISTINCT FROM NULL') && values.periodEnd != null)
    return false;
  if (
    query.sql.includes('"max_mode_period_start" <=') &&
    values.maxModePeriodStart instanceof Date &&
    values.maxModePeriodStart > now
  )
    return false;
  return true;
}
function database() {
  let tail = Promise.resolve();
  return {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          orderBy: () => ({
            limit: async () => {
              const threshold = dialect.sqlToQuery(condition).params[0] as string;
              return state.reservations
                .filter((r) => !r.settledAt && r.updatedAt <= new Date(threshold))
                .slice(0, 5)
                .map((r) => ({ id: r.id, userId: r.userId }));
            },
          }),
        }),
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "read committed" });
      let release!: () => void;
      let snapshot: ReturnType<typeof structuredClone> | undefined;
      const assertLocked = () => expect(snapshot).toBeDefined();
      const tx = {
        execute: async (statement: SQL) => {
          expect(dialect.sqlToQuery(statement).sql).toContain('FROM "user"');
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          snapshot = structuredClone({
            quota: state.quota,
            reservations: state.reservations,
            events: state.events,
            billings: state.billings,
          });
          state.locks++;
          return [{ id: "user" }];
        },
        select: (fields?: { baseUsed?: unknown }) => ({
          from: (table: Parameters<typeof getTableName>[0]) => {
            let joined = false;
            const query = {
              innerJoin: () => {
                joined = true;
                return query;
              },
              where: (condition: SQL) => {
                assertLocked();
                const name = getTableName(table);
                let rows: object[] = [];
                if (name === "billing")
                  rows = state.billings.filter((b) =>
                    joined ? b.organizationId === state.team && !!state.team : !b.organizationId,
                  );
                if (name === "usage_quota") rows = state.quota ? [state.quota] : [];
                if (name === "usage_reservation")
                  rows = state.reservations.filter((r) => matches(r, condition));
                if (name === "team_member_usage_policy")
                  rows = [
                    {
                      maxModeEnabled: true,
                      maxModeLimitBasic: state.cap,
                      maxModeLimitPremium: state.cap,
                    },
                  ];
                if (fields?.baseUsed)
                  rows = [
                    {
                      baseUsed: rows.length ? (rows[0] as Reservation).baseUsed : null,
                      settledUsed: rows.reduce(
                        (sum, row) => sum + ((row as Reservation).settledAmount ?? 0),
                        0,
                      ),
                    },
                  ];
                const result = Promise.resolve(structuredClone(rows));
                return Object.assign(result, { limit: () => result });
              },
            };
            return query;
          },
        }),
        insert: (table: Parameters<typeof getTableName>[0]) => ({
          values: (input: Record<string, unknown>) => {
            assertLocked();
            const name = getTableName(table);
            if (name === "usage_reservation") {
              state.reservations.push({
                observedAmount: 0,
                settledAt: null,
                settledAmount: null,
                maxModeAmount: 0,
                ...input,
              } as Reservation);
              return Promise.resolve();
            }
            if (name === "max_mode_meter_event")
              return {
                onConflictDoNothing: async () => {
                  if (state.failMeter) throw new Error("Meter persistence failed");
                  if (!state.events.some((e) => e.id === input.id))
                    state.events.push(input as Event);
                },
              };
            return {
              onConflictDoUpdate: () => ({
                returning: async () => {
                  if (state.failQuota) throw new Error("Quota write failed");
                  const reset =
                    !state.quota ||
                    state.quota.unit !== input.unit ||
                    (state.quota.periodEnd && state.quota.periodEnd <= (input.periodStart as Date));
                  state.quota = {
                    ...state.quota,
                    ...input,
                    used: (reset ? 0 : state.quota!.used) + Number(input.used),
                  } as Quota;
                  return [{ used: state.quota.used }];
                },
              }),
            };
          },
        }),
        update: (table: Parameters<typeof getTableName>[0]) => ({
          set: (updates: Record<string, unknown>) => ({
            where: (condition: SQL) => {
              const result = Promise.resolve().then(() => {
                assertLocked();
                const name = getTableName(table);
                if (name === "usage_quota" && state.failQuota)
                  throw new Error("Quota write failed");
                const rows =
                  name === "usage_quota"
                    ? state.quota
                      ? [state.quota]
                      : []
                    : name === "billing"
                      ? state.billings
                      : state.reservations;
                const matched = rows.filter((row) => matches(row, condition));
                for (const row of matched)
                  for (const [key, value] of Object.entries(updates)) {
                    const target = row as unknown as Record<string, unknown>;
                    if (value instanceof SQL) {
                      const expression = dialect.sqlToQuery(value);
                      target[key] =
                        key === "observedAmount"
                          ? Math.max(Number(target[key]), Number(expression.params[0]))
                          : Math.max(0, Number(target[key]) + Number(expression.params[0]));
                    } else target[key] = value;
                  }
                return matched;
              });
              return Object.assign(result, { returning: () => result });
            },
          }),
        }),
      };
      try {
        return await run(tx);
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
  state.quota = {
    userId: "user",
    category: "basic",
    used: limit - 10,
    unit: "tokens",
    periodStart: now,
    periodEnd: new Date("2026-07-01"),
  } as Quota;
  state.reservations = [];
  state.events = [];
  state.team = null;
  state.cap = null;
  state.failQuota = false;
  state.failMeter = false;
  state.locks = 0;
  state.billings = [
    {
      id: "personal",
      userId: "user",
      organizationId: null,
      stripeCustomerId: "personal-customer",
      planId: "pro_monthly",
      status: "active",
      maxModeEnabled: true,
      maxModeUsageBasic: 0,
      maxModeUsagePremium: 0,
      maxModePeriodStart: now,
      deletionPending: false,
    } as Billing,
  ];
  state.database = database();
});
const reserve = (reservationId: string, amount = 20) =>
  consumeUsage({ userId: "user", category: "basic", reservationId, amount, now });
const settle = (reservationId: string, amount: number, at = now) =>
  settleUsage({ userId: "user", reservationId, amount, now: at });

test("parallel reservations never permanently bill estimates", async () => {
  await Promise.all([reserve("a"), reserve("b")]);
  expect(state.quota!.used).toBe(limit + 30);
  expect(state.billings[0].maxModeUsageBasic).toBe(0);
  expect(state.events).toHaveLength(0);
});
test.each([true, false])(
  "an aborted reservation cannot overbill another generation (first abort: %s)",
  async (firstAbort) => {
    await Promise.all([reserve("a"), reserve("b")]);
    if (firstAbort) {
      await settle("a", 0);
      await settle("b", 20);
    } else {
      await settle("b", 20);
      await settle("a", 0);
    }
    expect(state.quota!.used).toBe(limit + 10);
    expect(state.events.map((e) => e.amount)).toEqual([10]);
    expect(state.billings[0].maxModeUsageBasic).toBe(10);
  },
);
test("concurrent finalization bills each actual token once", async () => {
  await Promise.all([reserve("a"), reserve("b")]);
  await Promise.all([settle("a", 20), settle("b", 20)]);
  expect(state.events.reduce((sum, e) => sum + e.amount, 0)).toBe(30);
});
test("old-period settlement neither refunds the new quota nor bills a returned estimate", async () => {
  await reserve("a");
  state.quota!.periodStart = new Date("2026-07-01");
  state.quota!.periodEnd = new Date("2026-08-01");
  state.quota!.used = 100;
  await settle("a", 10, new Date("2026-07-01"));
  expect(state.quota!.used).toBe(100);
  expect(state.events).toHaveLength(0);
});
test("late old-period overage retains its payer and timestamp, without inflating the new ledger", async () => {
  await reserve("a");
  state.quota!.periodStart = new Date("2026-07-01");
  state.quota!.used = 100;
  state.billings[0].maxModePeriodStart = new Date("2026-07-01");
  await settle("a", 20, new Date("2026-07-01"));
  expect(state.events[0]).toMatchObject({
    amount: 10,
    stripeCustomerId: "personal-customer",
    occurredAt: now,
  });
  expect(state.billings[0].maxModeUsageBasic).toBe(0);
  expect(state.quota!.used).toBe(100);
});
test("membership changes never move a generation's charge to a different payer", async () => {
  const team = {
    ...state.billings[0],
    id: "team-a",
    organizationId: "team-a",
    planId: "pro_team_monthly",
    stripeCustomerId: "customer-a",
  };
  state.billings.push(team, {
    ...team,
    id: "team-b",
    organizationId: "team-b",
    stripeCustomerId: "customer-b",
  });
  state.team = "team-a";
  await reserve("a");
  state.team = "team-b";
  await settle("a", 20);
  expect(state.events[0].stripeCustomerId).toBe("customer-a");
  expect(state.billings[1].maxModeUsageBasic).toBe(10);
  expect(state.billings[2].maxModeUsageBasic).toBe(0);
});
test("parallel reservations respect a member's Max Mode cap", async () => {
  state.billings[0].organizationId = "team";
  state.billings[0].planId = "pro_team_monthly";
  state.team = "team";
  state.cap = 20;
  state.quota!.used = limit;
  const results = await Promise.allSettled([reserve("a"), reserve("b")]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
test("actual usage beyond the estimate records all usage but honors the captured member cap", async () => {
  state.billings[0].organizationId = "team";
  state.billings[0].planId = "pro_team_monthly";
  state.team = "team";
  state.cap = 15;
  await reserve("a");
  await settle("a", 40);
  expect(state.quota!.used).toBe(limit + 30);
  expect(state.events[0].amount).toBe(15);
});
test("quota-write failure rolls back the reservation", async () => {
  state.failQuota = true;
  await expect(reserve("a")).rejects.toThrow("Quota write failed");
  expect(state.reservations).toHaveLength(0);
  expect(state.quota!.used).toBe(limit - 10);
});
test("meter persistence failure rolls back quota, ledger, and settlement together", async () => {
  await reserve("a");
  state.failMeter = true;
  await expect(settle("a", 15)).rejects.toThrow("Meter persistence failed");
  expect(state.quota!.used).toBe(limit + 10);
  expect(state.billings[0].maxModeUsageBasic).toBe(0);
  expect(state.reservations[0].settledAt).toBeNull();
});
test("replayed reserve and settlement calls are idempotent", async () => {
  await reserve("a");
  await reserve("a");
  await settle("a", 20);
  await settle("a", 999);
  expect(state.reservations).toHaveLength(1);
  expect(state.events).toHaveLength(1);
  expect(state.events[0].amount).toBe(10);
  expect(state.quota!.used).toBe(limit + 10);
});
test("a guest reservation cannot refund a converted token quota", async () => {
  state.quota = null;
  await consumeUsage({
    userId: "user",
    category: "basic",
    reservationId: "a",
    amount: 1,
    isAnonymous: true,
    now,
  });
  state.quota!.unit = "tokens";
  state.quota!.used = 100;
  await settle("a", 0);
  expect(state.quota!.used).toBe(100);
});
test("empty guest quotas are protected against parallel creation", async () => {
  state.quota = null;
  const results = await Promise.allSettled(
    ["a", "b"].map((reservationId) =>
      consumeUsage({
        userId: "user",
        category: "basic",
        reservationId,
        amount: 30,
        isAnonymous: true,
        now,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
test("frozen accounts cannot start a new paid generation", async () => {
  state.billings[0].deletionPending = true;
  await expect(reserve("a")).rejects.toThrow("Account deletion");
  expect(state.reservations).toHaveLength(0);
});
test("usage exceeding the signed 32-bit range can be settled", async () => {
  state.quota!.used = 2_147_483_640;
  await reserve("a", 20);
  await settle("a", 20);
  expect(state.quota!.used).toBe(2_147_483_660);
  expect(state.events[0].amount).toBe(20);
});

test("interrupted generations recover actual provider usage without retaining the estimate", async () => {
  await reserve("a", 20);
  await recordObservedUsage({ userId: "user", reservationId: "a", amount: 15, now });
  expect(await recoverUsageReservations(new Date(now.getTime() + 16 * 60_000))).toEqual({
    recovered: 1,
    recoveryFailed: 0,
  });
  expect(state.quota!.used).toBe(limit + 5);
  expect(state.events[0].amount).toBe(5);
});
test("an abandoned generation with no output releases its entire reservation", async () => {
  await reserve("a", 20);
  await recoverUsageReservations(new Date(now.getTime() + 16 * 60_000));
  expect(state.quota!.used).toBe(limit - 10);
  expect(state.events).toHaveLength(0);
});
test("a heartbeat that wins the account lock prevents stale recovery", async () => {
  await reserve("a");
  await recordObservedUsage({
    userId: "user",
    reservationId: "a",
    amount: 15,
    now: new Date(now.getTime() + 16 * 60_000),
  });
  const result = await settleUsage({
    userId: "user",
    reservationId: "a",
    amount: 0,
    staleBefore: new Date(now.getTime() + 60_000),
  });
  expect(result.amount).toBeNull();
  expect(state.reservations[0].settledAt).toBeNull();
  expect(state.events).toHaveLength(0);
});
test("late observations cannot reopen an already settled receipt", async () => {
  await reserve("a");
  await settle("a", 20);
  const updatedAt = state.reservations[0].updatedAt;
  await recordObservedUsage({
    userId: "user",
    reservationId: "a",
    amount: 99,
    now: new Date(now.getTime() + 60_000),
  });
  expect(state.reservations[0].updatedAt).toEqual(updatedAt);
  expect(state.events).toHaveLength(1);
});
