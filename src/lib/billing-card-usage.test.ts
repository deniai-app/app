import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import type { db } from "@/db/drizzle";
import { claimCardVerification, grantCardVerificationFlashOffer } from "./billing-card-usage";
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("./stripe", () => ({ stripe: {} }));

type Row = {
  userId: string;
  stripeCustomerId: string;
  paymentMethodFingerprint: string;
  cardVerifiedAt: Date;
};
let rows: Row[];
let locks: string[];
const dialect = new PgDialect();
function database() {
  let tail = Promise.resolve();
  const transaction = {
    execute: async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes("pg_advisory_xact_lock")) locks.push(query.params[0] as string);
      else expect(query.sql).toContain("FOR UPDATE");
    },
    select: () => ({
      from: () => ({
        where: async (condition: SQL) => {
          const [fingerprint, user] = dialect.sqlToQuery(condition).params;
          return [
            {
              count: new Set(
                rows
                  .filter(
                    (row) => row.paymentMethodFingerprint === fingerprint && row.userId !== user,
                  )
                  .map((row) => row.userId),
              ).size,
            },
          ];
        },
      }),
    }),
    insert: () => ({
      values: (values: Row) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            const previous = rows.find((row) => row.userId === values.userId);
            if (previous) Object.assign(previous, values);
            else rows.push(values);
            return [values];
          },
        }),
      }),
    }),
  };
  return {
    transaction: async (run: (tx: typeof transaction) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "read committed" });
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await run(transaction);
      } finally {
        release();
      }
    },
  } as unknown as typeof db;
}
beforeEach(() => {
  rows = [];
  locks = [];
});
test.each(["credit", "debit", "unknown"] as const)(
  "concurrent %s verification claims cannot exceed two distinct accounts",
  async (funding) => {
    const mocked = database();
    const results = await Promise.all(
      ["a", "b", "c"].map((userId) =>
        claimCardVerification(mocked, {
          userId,
          customerId: userId,
          fingerprint: "shared",
          funding,
        }),
      ),
    );
    expect(results.filter((result) => result.eligible)).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(locks).toEqual(Array(3).fill("card-verification:shared"));
  },
);
test("prepaid cards allow only one concurrent account", async () => {
  const mocked = database();
  const results = await Promise.all(
    ["a", "b"].map((userId) =>
      claimCardVerification(mocked, {
        userId,
        customerId: userId,
        fingerprint: "shared",
        funding: "prepaid",
      }),
    ),
  );
  expect(results.filter((result) => result.eligible)).toHaveLength(1);
  expect(rows).toHaveLength(1);
});
test("reverification of the same account does not occupy another slot", async () => {
  const mocked = database();
  const claim = {
    userId: "a",
    customerId: "a",
    fingerprint: "shared",
    funding: "prepaid" as const,
  };
  expect((await claimCardVerification(mocked, claim)).eligible).toBe(true);
  expect((await claimCardVerification(mocked, claim)).eligible).toBe(true);
  expect(rows).toHaveLength(1);
});
test("card verification flash offer is granted once per never-paid account", async () => {
  const calls: { set: Record<string, unknown>; where: SQL }[] = [];
  const mocked = {
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            calls.push({ set, where });
            return [{ userId: "a" }];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
  const now = new Date("2026-10-11T00:00:00.000Z");

  expect(await grantCardVerificationFlashOffer(mocked, "a", now)).toBe(true);

  const [call] = calls;
  const where = dialect.sqlToQuery(call.where);
  expect(where.sql).toContain('"card_offer_granted_at" is null');
  expect(where.sql).toContain('"first_paid_at" is null');
  expect(where.sql).toContain('"organization_id" is null');
  expect(call.set.cardOfferGrantedAt).toEqual(now);
  const endsAt = dialect.sqlToQuery(call.set.flashOfferEndsAt as SQL);
  expect(endsAt.sql).toContain("GREATEST");
  expect(endsAt.params).toContain("2026-10-13T00:00:00.000Z");
});
