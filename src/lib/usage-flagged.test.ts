import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { getUsageSummary } from "./usage";

const state = vi.hoisted(() => ({ flagged: false, fingerprint: null as string | null }));
vi.mock("./max-mode", () => ({ isMaxModeEligible: () => false }));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const query = {
          innerJoin: () => query,
          where: () => {
            const name = getTableName(table);
            let rows: Record<string, unknown>[] = [];
            // A Free account: a billing row with no plan, and no team.
            if (name === "billing" && !("joined" in query))
              rows = [
                { planId: null, status: "inactive", paymentMethodFingerprint: state.fingerprint },
              ];
            if (name === "signup_risk" && state.flagged) rows = [{ userId: "user" }];
            const result = Promise.resolve(rows);
            return Object.assign(result, { limit: () => result });
          },
        };
        return query;
      },
    }),
  },
}));

beforeEach(() => {
  state.flagged = false;
  state.fingerprint = null;
});

const summary = () => getUsageSummary({ userId: "user", now: new Date("2026-06-10") });
const limits = async () => (await summary()).usage.map(({ limit }) => limit);

test("an unflagged Free account gets the normal Free limits", async () => {
  expect(await limits()).toEqual([10_000_000, 2_000_000]);
});

test("a Free account flagged at sign-up gets the reduced limits", async () => {
  state.flagged = true;
  expect(await limits()).toEqual([3_000_000, 500_000]);
});

test("verifying a payment method lifts the reduction", async () => {
  state.flagged = true;
  state.fingerprint = "fp_card";
  expect(await limits()).toEqual([25_000_000, 10_000_000]);
});

test("the summary tells a limited user the way out, and nobody else", async () => {
  expect((await summary()).signupLimited).toBe(false);

  state.flagged = true;
  expect((await summary()).signupLimited).toBe(true);

  state.fingerprint = "fp_card";
  expect((await summary()).signupLimited).toBe(false);
});
