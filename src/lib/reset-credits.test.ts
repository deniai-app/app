import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { consumeResetCredit } from "./reset-credits";

const state = vi.hoisted(() => ({
  credits: 1,
  used: 100,
  failQuota: false,
  locked: false,
  writes: [] as string[],
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const original = { credits: state.credits, used: state.used };
      const tx = {
        execute: async () => {
          state.locked = true;
        },
        update: (table: Parameters<typeof getTableName>[0]) => ({
          set: () => ({
            where: () => {
              const result = Promise.resolve().then(() => {
                expect(state.locked).toBe(true);
                const name = getTableName(table);
                state.writes.push(name);
                if (name === "usage_quota") {
                  if (state.failQuota) throw new Error("Quota write failed");
                  state.used = 0;
                  return [];
                }
                if (state.credits <= 0) return [];
                return [{ credits: --state.credits }];
              });
              return Object.assign(result, { returning: () => result });
            },
          }),
        }),
      };
      try {
        return await run(tx);
      } catch (error) {
        Object.assign(state, original);
        throw error;
      } finally {
        state.locked = false;
      }
    },
  },
}));
beforeEach(() => {
  state.credits = 1;
  state.used = 100;
  state.failQuota = false;
  state.locked = false;
  state.writes = [];
});
test("a failed reset returns the credit and keeps the original quota", async () => {
  state.failQuota = true;
  await expect(consumeResetCredit("user")).rejects.toThrow("Quota write failed");
  expect(state.credits).toBe(1);
  expect(state.used).toBe(100);
});
test("a reset changes only the user's allowance, preserving all accrued billing ledgers", async () => {
  expect(await consumeResetCredit("user")).toBe(0);
  expect(state.used).toBe(0);
  expect(state.writes).toEqual(["reset_credit_balance", "usage_quota"]);
});
test("no credit leaves usage untouched", async () => {
  state.credits = 0;
  expect(await consumeResetCredit("user")).toBeNull();
  expect(state.used).toBe(100);
});
