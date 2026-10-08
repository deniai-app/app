import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  failCreditWrites: 0,
  referralInsertGate: null as null | { waiting: number; size: number; release: () => void },
  gateOpened: null as Promise<void> | null,
  riskReadsOutsideTransaction: 0,
}));

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000" } }));
vi.mock("@/lib/affiliate-risk", () => ({
  hashClaimIp: () => null,
  evaluateRegistrationReward: async (_params: unknown, database?: { isTransaction?: boolean }) => {
    // Under the referrer lock, risk reads must reuse the transaction's connection.
    state.riskReadsOutsideTransaction += database?.isTransaction ? 0 : 1;
    return { autoApprove: true, risk: { score: 0, flags: [], hardBlock: false }, tier: "high" };
  },
}));

vi.mock("@/db/drizzle", async () => {
  const dialect = new PgDialect();
  const params = (condition: unknown) =>
    condition ? dialect.sqlToQuery(condition as SQL).params : [];
  const rows = (table: string) => (state.tables[table] ??= []);
  let lockTail = Promise.resolve();

  function database(): Record<string, unknown> {
    return {
      select: (fields?: Row) => ({
        from: (table: Parameters<typeof getTableName>[0]) => ({
          where: (condition: unknown) => {
            const name = getTableName(table);
            const values = params(condition);
            const run = async () => {
              if (fields && "count" in fields) return [{ count: rows(name).length }];
              if (name === "user" || name === "affiliate_referral")
                return rows(name).filter((row) =>
                  values.includes(name === "user" ? row.id : row.referredUserId),
                );
              if (name === "affiliate_profile")
                return rows(name).filter((row) => values.includes(row.code));
              return rows(name);
            };
            return Object.assign(run(), { limit: run });
          },
        }),
      }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: (value: Row) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              const name = getTableName(table);
              if (name === "affiliate_referral") {
                const gate = state.referralInsertGate;
                const row = { ...value, id: `referral-${rows(name).length + 1}` };
                rows(name).push(row);
                if (gate) {
                  gate.waiting += 1;
                  if (gate.waiting === gate.size) gate.release();
                  await state.gateOpened;
                }
                return [row];
              }
              if (
                rows(name).some(
                  (row) => row.milestone === value.milestone || row.referralId === value.referralId,
                )
              )
                return [];
              const row = { ...value, id: `reward-${rows(name).length + 1}` };
              rows(name).push(row);
              return [row];
            },
          }),
        }),
      }),
      update: (table: Parameters<typeof getTableName>[0]) => ({
        set: (value: Row) => ({
          where: (condition: unknown) => {
            const name = getTableName(table);
            const run = async () => {
              if (name === "affiliate_profile") {
                if (state.failCreditWrites > 0) {
                  state.failCreditWrites -= 1;
                  throw new Error("credit write failed");
                }
                for (const profile of rows(name))
                  profile.resetCredits = Number(profile.resetCredits) + 1;
                return [];
              }
              const ids = params(condition);
              const matched = rows(name).filter(
                (row) => ids.includes(row.id) && row.status === "pending",
              );
              for (const row of matched) Object.assign(row, { status: value.status });
              return matched.map((row) => ({ ...row }));
            };
            // Lazy like drizzle: the write runs once, whether awaited or `.returning()`.
            let result: Promise<Row[]> | undefined;
            const once = () => (result ??= run());
            return Object.assign(Promise.resolve().then(once), { returning: once });
          },
        }),
      }),
    };
  }

  return {
    db: {
      ...database(),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        let release = () => {};
        const tx = {
          ...database(),
          isTransaction: true,
          execute: async () => {
            const previous = lockTail;
            lockTail = new Promise<void>((resolve) => (release = resolve));
            await previous;
          },
        };
        const snapshot = structuredClone(state.tables);
        try {
          return await run(tx);
        } catch (error) {
          state.tables = snapshot;
          throw error;
        } finally {
          release();
        }
      },
    },
  };
});

const { approveAffiliateResetReward, claimAffiliateReferral } = await import("./affiliate");

beforeEach(() => {
  state.failCreditWrites = 0;
  state.referralInsertGate = null;
  state.gateOpened = null;
  state.riskReadsOutsideTransaction = 0;
  state.tables = {
    user: [],
    affiliate_profile: [{ userId: "referrer", code: "ABCDEFGHJK", id: "profile", resetCredits: 0 }],
    affiliate_referral: [],
    affiliate_reward: [],
    billing: [],
  };
});

test("concurrent claims that cross two milestones award both milestones", async () => {
  const now = new Date();
  for (let index = 1; index <= 6; index += 1) {
    state.tables.user.push({
      id: `user-${index}`,
      createdAt: now,
      isAnonymous: false,
      email: `user${index}@example.com`,
      emailVerified: true,
    });
  }
  // Every referral row is written before any claim counts: all six see count=6.
  state.gateOpened = new Promise<void>((release) => {
    state.referralInsertGate = { waiting: 0, size: 6, release };
  });

  await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      claimAffiliateReferral({ userId: `user-${index + 1}`, code: "ABCDEFGHJK" }),
    ),
  );

  const rewards = state.tables.affiliate_reward;
  expect(rewards.map((reward) => reward.milestone).sort()).toEqual([1, 2]);
  expect(new Set(rewards.map((reward) => reward.referralId)).size).toBe(2);
  expect(state.tables.affiliate_profile[0].resetCredits).toBe(2);
  expect(state.riskReadsOutsideTransaction).toBe(0);
});

test("claims below the first milestone take no lock and evaluate no reward", async () => {
  state.tables.user.push({
    id: "user-1",
    createdAt: new Date(),
    isAnonymous: false,
    email: "user1@example.com",
    emailVerified: true,
  });
  await claimAffiliateReferral({ userId: "user-1", code: "ABCDEFGHJK" });
  expect(state.tables.affiliate_reward).toEqual([]);
  expect(state.riskReadsOutsideTransaction).toBe(0);
});

test("a failed credit grant rolls back approval so a retry grants exactly once", async () => {
  state.tables.affiliate_reward.push({
    id: "reward-1",
    referrerId: "referrer",
    status: "pending",
    quantity: 1,
  });
  state.failCreditWrites = 1;

  await expect(
    approveAffiliateResetReward({ rewardId: "reward-1", adminEmail: "admin@example.com" }),
  ).rejects.toThrow("credit write failed");
  expect(state.tables.affiliate_reward[0].status).toBe("pending");
  expect(state.tables.affiliate_profile[0].resetCredits).toBe(0);

  const approved = await approveAffiliateResetReward({
    rewardId: "reward-1",
    adminEmail: "admin@example.com",
  });
  expect(approved).toMatchObject({ id: "reward-1", status: "approved" });
  expect(state.tables.affiliate_profile[0].resetCredits).toBe(1);
  expect(
    await approveAffiliateResetReward({ rewardId: "reward-1", adminEmail: "admin@example.com" }),
  ).toBeNull();
  expect(state.tables.affiliate_profile[0].resetCredits).toBe(1);
});
