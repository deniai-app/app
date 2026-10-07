import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deliverMaxModeMeterEvents, enqueueMaxModeMeterEvent } from "./max-mode-meter-events";
import { stripe } from "./stripe";
import type { maxModeMeterEvent } from "@/db/schema";

type Event = typeof maxModeMeterEvent.$inferSelect;
const state = vi.hoisted(() => ({ rows: [] as Event[], failAcknowledgement: false }));
vi.mock("./stripe", () => ({ stripe: { billing: { meterEvents: { create: vi.fn() } } } }));
vi.mock("@/db/drizzle", () => {
  const field = (column: string) =>
    column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof Event;
  const matches = (row: Event, condition: SQL) => {
    const query = new PgDialect().sqlToQuery(condition);
    for (const match of query.sql.matchAll(/"([a-z_]+)" = \$(\d+)/g)) {
      if (row[field(match[1])] !== query.params[Number(match[2]) - 1]) return false;
    }
    if (query.sql.includes('"delivered_at" is null') && row.deliveredAt) return false;
    if (query.sql.includes('"next_attempt_at" <=') && row.nextAttemptAt > new Date()) return false;
    if (query.sql.includes('"lease_until" <=') && row.leaseUntil && row.leaseUntil > new Date())
      return false;
    if (
      query.sql.includes('"lease_until" > now()') &&
      (!row.leaseUntil || row.leaseUntil <= new Date())
    )
      return false;
    return true;
  };
  let tail = Promise.resolve();
  const database = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await run(database);
      } finally {
        release();
      }
    },
    insert: () => ({
      values: (values: Partial<Event>) => ({
        onConflictDoNothing: async () => {
          if (!state.rows.some((row) => row.id === values.id))
            state.rows.push({
              attempts: 0,
              firstAttemptAt: null,
              nextAttemptAt: new Date(),
              leaseToken: null,
              leaseUntil: null,
              deliveredAt: null,
              requiresReview: false,
              lastError: null,
              ...values,
            } as Event);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          orderBy: () => ({
            limit: () => ({
              for: async () =>
                state.rows
                  .filter((row) => matches(row, condition))
                  .slice(0, 1)
                  .map((row) => ({ ...row })),
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (fields: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const applied = Promise.resolve().then(() => {
            if (fields.deliveredAt && state.failAcknowledgement) {
              state.failAcknowledgement = false;
              throw new Error("DB acknowledgement failed");
            }
            const rows = state.rows.filter((row) => matches(row, condition));
            for (const row of rows)
              for (const [key, value] of Object.entries(fields)) {
                if (value instanceof SQL) row.attempts++;
                else Object.assign(row, { [key]: value });
              }
            return rows.map((row) => ({ ...row }));
          });
          return Object.assign(applied, { returning: () => applied });
        },
      }),
    }),
  };
  return { db: database };
});

const occurredAt = new Date("2026-06-01T00:00:00Z");
const event = {
  id: "generation:model",
  userId: "user",
  stripeCustomerId: "customer",
  category: "basic" as const,
  amount: 123,
  occurredAt,
};
const prepare = vi.fn(async (row: Event) => row.stripeCustomerId!);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(occurredAt);
  vi.clearAllMocks();
  state.rows = [];
  state.failAcknowledgement = false;
  vi.mocked(stripe.billing.meterEvents.create).mockResolvedValue({} as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("a failed report survives and retries with its original amount, time, and identity", async () => {
  await enqueueMaxModeMeterEvent(event);
  await enqueueMaxModeMeterEvent({ ...event, amount: 999 });
  expect(state.rows).toHaveLength(1);
  vi.mocked(stripe.billing.meterEvents.create).mockRejectedValueOnce(
    new Error("Stripe unavailable"),
  );
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ failed: 1 });
  expect(state.rows[0].deliveredAt).toBeNull();
  expect(state.rows[0].lastError).toContain("Stripe unavailable");
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 0 });
  vi.setSystemTime(new Date(occurredAt.getTime() + 61_000));
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 1 });
  const calls = vi.mocked(stripe.billing.meterEvents.create).mock.calls;
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[1][0]).toEqual({
    event_name: "max_mode_basic",
    identifier: event.id,
    timestamp: occurredAt.getTime() / 1000,
    payload: { stripe_customer_id: "customer", value: "123" },
  });
  expect(calls[1][1]).toMatchObject({ idempotencyKey: event.id });
  expect(state.rows[0].deliveredAt).toBeInstanceOf(Date);
});

test("concurrent workers cannot send an event already leased by another worker", async () => {
  await enqueueMaxModeMeterEvent(event);
  let release!: () => void;
  vi.mocked(stripe.billing.meterEvents.create).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({} as never);
      }) as never,
  );
  const first = deliverMaxModeMeterEvents(prepare);
  await vi.waitFor(() => expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1));
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 0 });
  release();
  expect(await first).toMatchObject({ delivered: 1 });
  expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1);
});

test("a crash after Stripe acceptance reuses the same idempotency key", async () => {
  await enqueueMaxModeMeterEvent(event);
  state.failAcknowledgement = true;
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ failed: 1 });
  vi.setSystemTime(new Date(occurredAt.getTime() + 61_000));
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 1 });
  const calls = vi.mocked(stripe.billing.meterEvents.create).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
});

test("ambiguous reports outside Stripe's deduplication window require review", async () => {
  await enqueueMaxModeMeterEvent(event);
  state.rows[0].firstAttemptAt = occurredAt;
  vi.setSystemTime(new Date(occurredAt.getTime() + 24 * 60 * 60_000));
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ requiresReview: 1 });
  expect(state.rows[0].requiresReview).toBe(true);
  expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
});

test("expired leases are recovered after an interrupted worker", async () => {
  await enqueueMaxModeMeterEvent(event);
  state.rows[0].leaseToken = "interrupted-worker";
  state.rows[0].leaseUntil = new Date(occurredAt.getTime() + 5 * 60_000);
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 0 });
  vi.setSystemTime(new Date(occurredAt.getTime() + 6 * 60_000));
  expect(await deliverMaxModeMeterEvents(prepare)).toMatchObject({ delivered: 1 });
});

test("customer setup failures retain the event without starting the meter retry window", async () => {
  await enqueueMaxModeMeterEvent(event);
  expect(
    await deliverMaxModeMeterEvents(async () => {
      throw new Error("Missing metered price");
    }),
  ).toMatchObject({ failed: 1 });
  expect(state.rows[0].firstAttemptAt).toBeNull();
  expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
});
