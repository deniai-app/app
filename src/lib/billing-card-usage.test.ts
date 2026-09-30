import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import type { db } from "@/db/drizzle";
import { claimCardVerification } from "./billing-card-usage";
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
