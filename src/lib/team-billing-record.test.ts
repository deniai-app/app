import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { canonicalTeamBillingRow, saveTeamBillingRecord } from "./team-billing-record";
import type { db } from "@/db/drizzle";
vi.mock("@/db/drizzle", () => ({ db: {} }));

type Record = {
  id: string;
  userId: string;
  organizationId: string;
  stripeCustomerId: string;
  status: string;
  maxModeUsageBasic?: number;
  stripeSubscriptionId?: string | null;
};
let records: Record[];
const dialect = new PgDialect();
let locks: string[];
function database() {
  let tail = Promise.resolve();
  const transaction = {
    execute: async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      expect(query.sql).toContain("pg_advisory_xact_lock");
      locks.push(query.params[0] as string);
    },
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          orderBy: () => ({
            limit: async () =>
              records
                .filter((row) => row.organizationId === dialect.sqlToQuery(condition).params[0])
                .slice(0, 1),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (updates: Partial<Record>) => ({
        where: (condition: SQL) => ({
          returning: async () => {
            const { params } = dialect.sqlToQuery(condition);
            const matched = records.filter((row) =>
              params.length === 1
                ? row.id === params[0]
                : row.organizationId === params[0] && row.id !== params[1],
            );
            const definedUpdates = Object.fromEntries(
              Object.entries(updates).filter(([, value]) => value !== undefined),
            );
            matched.forEach((row) => Object.assign(row, definedUpdates));
            return matched;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Omit<Record, "id">) => ({
        returning: async () => {
          const row = { id: `row-${records.length}`, ...values };
          records.push(row);
          return [row];
        },
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
  records = [];
  locks = [];
});
test("different admins use one organization billing identity even on concurrent creation", async () => {
  const mocked = database();
  const results = await Promise.all(
    ["owner", "admin"].map((user) =>
      saveTeamBillingRecord(mocked, user, "team", {
        stripeCustomerId: "customer",
        status: "active",
      }),
    ),
  );
  expect(records).toHaveLength(1);
  expect(results[0].id).toBe(results[1].id);
  expect(results[1].userId).toBe("owner");
  expect(locks).toEqual(["team-billing:team", "team-billing:team"]);
});
test("revocation clears ALL historical admin copies but preserves their ledgers and other teams", async () => {
  records = [
    {
      id: "owner-row",
      userId: "owner",
      organizationId: "team",
      stripeCustomerId: "customer",
      status: "active",
      maxModeUsageBasic: 12,
    },
    {
      id: "admin-row",
      userId: "admin",
      organizationId: "team",
      stripeCustomerId: "legacy-customer",
      status: "active",
      maxModeUsageBasic: 4,
    },
    {
      id: "other-row",
      userId: "other",
      organizationId: "other-team",
      stripeCustomerId: "other-customer",
      status: "active",
    },
  ];
  const saved = await saveTeamBillingRecord(database(), "admin", "team", {
    stripeCustomerId: "customer",
    status: "inactive",
    stripeSubscriptionId: null,
    planId: null,
  });
  expect(saved.id).toBe("owner-row");
  expect(records.slice(0, 2).map((row) => row.status)).toEqual(["inactive", "inactive"]);
  expect(records.slice(0, 2).map((row) => row.maxModeUsageBasic)).toEqual([12, 4]);
  expect(records[2].status).toBe("active");
  expect(records[1].stripeCustomerId).toBe("legacy-customer");
});
test("entitlement predicate selects the canonical organization row, not an active admin copy", () => {
  const query = dialect.sqlToQuery(canonicalTeamBillingRow());
  expect(query.sql).toContain("canonical.organization_id");
  expect(query.sql).toContain("ORDER BY canonical.created_at, canonical.id LIMIT 1");
});

test("a delayed old deletion cannot clear a team's replacement subscription", async () => {
  records = [
    {
      id: "owner-row",
      userId: "owner",
      organizationId: "team",
      stripeCustomerId: "customer",
      status: "active",
      stripeSubscriptionId: "sub_new",
    },
  ];
  const saved = await saveTeamBillingRecord(
    database(),
    "owner",
    "team",
    { stripeCustomerId: "customer", status: "inactive", stripeSubscriptionId: null },
    "sub_old",
  );
  expect(saved).toBeUndefined();
  expect(records[0]).toMatchObject({ status: "active", stripeSubscriptionId: "sub_new" });
});

test("a deletion webhook cannot recreate a deleted team's billing row", async () => {
  const saved = await saveTeamBillingRecord(
    database(),
    "owner",
    "team",
    { stripeCustomerId: "customer", status: "inactive", stripeSubscriptionId: null },
    "sub_old",
  );
  expect(saved).toBeUndefined();
  expect(records).toEqual([]);
});
