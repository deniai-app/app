import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "./route";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  review: vi.fn(),
  locks: 0,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ session: { userId: "advertiser" }, user: { isAnonymous: false } }),
    },
  },
}));
vi.mock("@/env", () => ({
  env: { STRIPE_SECRET_KEY: "test", STRIPE_WEBHOOK_SECRET: "test", OPENROUTER_API_KEY: "test" },
}));
vi.mock("@/lib/ad-review", () => ({ reviewAd: state.review }));
vi.mock("@/lib/ad-origin", () => ({ isAllowedAdOrigin: () => true }));
vi.mock("@/lib/ad-checkout", () => ({
  activatePaidAd: vi.fn(),
  releaseExpiredAdCheckout: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/ads", () => ({ adPlans: ["cpm", "cpc", "fixed"] }));
vi.mock("@/db/drizzle", () => {
  let tail = Promise.resolve();
  const database = {
    transaction: async (run: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "read committed" });
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
    execute: async (query: SQL) => {
      const statement = new PgDialect().sqlToQuery(query);
      expect(statement.sql).toContain('FROM "user"');
      expect(statement.sql).toContain("FOR UPDATE");
      state.locks++;
    },
    select: () => ({ from: () => ({ where: async () => [{ total: state.rows.length }] }) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const row = { id: String(state.rows.length), ...values };
          state.rows.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (query: SQL) => {
          const id = new PgDialect().sqlToQuery(query).params[0];
          const row = state.rows.find((item) => item.id === id);
          const applied = Promise.resolve().then(() => {
            if (row) Object.assign(row, values);
            return row ? [row] : [];
          });
          return Object.assign(applied, { returning: () => applied });
        },
      }),
    }),
  };
  return { db: database };
});

function request() {
  return new Request("http://localhost/api/ads/campaigns", {
    method: "POST",
    body: JSON.stringify({
      title: "Example product",
      description: "An example product description",
      defaultLanguage: "en",
      japaneseVariant: null,
      englishVariant: null,
      url: "https://advertiser.example/product",
      plan: "cpm",
      budgetYen: 300,
      targetLanguages: ["en"],
    }),
  });
}
beforeEach(() => {
  state.rows = Array.from({ length: 9 }, (_, i) => ({ id: String(i), status: "rejected" }));
  state.locks = 0;
  state.review.mockReset();
  state.review.mockResolvedValue({ approved: true, reason: "Approved" });
});

test("parallel submissions at nine campaigns reserve only the tenth before AI review", async () => {
  let release!: () => void;
  state.review.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ approved: true, reason: "Approved" });
      }),
  );
  const first = POST(request());
  await vi.waitFor(() => expect(state.review).toHaveBeenCalledTimes(1));
  expect(state.rows[9].status).toBe("review");
  expect((await POST(request())).status).toBe(429);
  release();
  expect((await first).status).toBe(201);
  expect(state.rows).toHaveLength(10);
  expect(state.review).toHaveBeenCalledTimes(1);
  expect(state.rows[9].status).toBe("approved");
  expect(state.locks).toBe(2);
});

test("failed reviews remain counted and unpayable", async () => {
  state.review.mockRejectedValueOnce(new Error("Reviewer unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect((await POST(request())).status).toBe(503);
    expect(state.rows[9].status).toBe("rejected");
    expect((await POST(request())).status).toBe(429);
  } finally {
    log.mockRestore();
  }
});
