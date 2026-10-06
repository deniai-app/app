import { AsyncLocalStorage } from "node:async_hooks";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type Stripe from "stripe";
import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/ads/campaigns/checkout/route";
import { activatePaidAd } from "./ad-checkout";

const state = vi.hoisted(() => ({
  database: {} as Record<string, unknown>,
  ads: [] as Record<string, unknown>[],
  create: vi.fn(),
  retrieve: vi.fn(),
  refund: vi.fn(),
  sessions: new Map<string, { id: string; url: string; expires_at: number }>(),
}));
vi.mock("@/db/drizzle", () => ({
  db: new Proxy({}, { get: (_target, key) => state.database[key as string] }),
}));
vi.mock("@/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "test",
    STRIPE_WEBHOOK_SECRET: "test",
    NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000",
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ session: { userId: "owner" }, user: { isAnonymous: false } }),
    },
  },
}));
vi.mock("@/lib/ad-origin", () => ({ isAllowedAdOrigin: () => true }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: state.create, retrieve: state.retrieve } },
    refunds: { create: state.refund },
  },
}));

const scope = new AsyncLocalStorage<boolean>();
const dialect = new PgDialect();
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
function ad(id = first) {
  return {
    id,
    userId: "owner",
    status: "approved",
    plan: "fixed",
    budgetYen: 3000,
    stripeSessionId: null,
    checkoutExpiresAt: null,
    endsAt: null,
    reviewReason: null,
  };
}
function database() {
  let tail = Promise.resolve();
  const tx = {
    execute: async (statement: SQL) => {
      expect(dialect.sqlToQuery(statement).sql).toContain("pg_advisory_xact_lock");
    },
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          limit: async () => {
            const { sql, params } = dialect.sqlToQuery(condition);
            const rows = sql.includes(" <>")
              ? state.ads.filter(
                  (row) =>
                    row.id !== params[0] &&
                    row.plan === "fixed" &&
                    ((row.status === "active" && (row.endsAt as Date) > new Date()) ||
                      (sql.includes("checkout_expires_at") &&
                        row.status === "approved" &&
                        (row.checkoutExpiresAt as Date) > new Date())),
                )
              : state.ads.filter(
                  (row) =>
                    row.id === params[0] &&
                    (!sql.includes('"user_id" =') || row.userId === params[1]),
                );
            return rows.slice(0, 1).map((row) => ({ ...row }));
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: SQL) => {
          const { sql, params } = dialect.sqlToQuery(condition);
          for (const row of state.ads) {
            if (row.id !== params[0]) continue;
            if (sql.includes('"stripe_session_id" =') && row.stripeSessionId !== params[1])
              continue;
            if (sql.includes('"review_reason" =') && row.reviewReason !== params[3]) continue;
            Object.assign(row, values);
          }
        },
      }),
    }),
  };
  return {
    transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await scope.run(true, () => run(tx));
      } finally {
        release();
      }
    },
  };
}
const checkout = (id = first) =>
  POST(
    new Request("http://localhost:3000/api/ads/campaigns/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  );
const paidSession = () =>
  ({
    id: "paid-session",
    mode: "payment",
    payment_status: "paid",
    currency: "jpy",
    metadata: { adCampaignId: first, userId: "owner" },
    amount_subtotal: 3000,
    amount_total: 3000,
    payment_intent: "intent",
  }) as unknown as Stripe.Checkout.Session;

beforeEach(() => {
  state.ads = [ad()];
  state.database = database();
  state.sessions.clear();
  state.retrieve.mockReset().mockImplementation(async () => {
    expect(scope.getStore(), "Stripe retrieve is outside the transaction").not.toBe(true);
    return { status: "expired" };
  });
  state.create
    .mockReset()
    .mockImplementation(
      async (params: { expires_at: number }, options: { idempotencyKey: string }) => {
        expect(scope.getStore(), "Stripe create is outside the transaction").not.toBe(true);
        if (!state.sessions.has(options.idempotencyKey))
          state.sessions.set(options.idempotencyKey, {
            id: "checkout",
            url: "https://checkout.stripe.com/session",
            expires_at: params.expires_at,
          });
        return state.sessions.get(options.idempotencyKey);
      },
    );
  state.refund.mockReset().mockImplementation(async () => {
    expect(scope.getStore(), "Stripe refund is outside the transaction").not.toBe(true);
    return { id: "refund" };
  });
});

test("concurrent checkout requests reuse one reserved session", async () => {
  const responses = await Promise.all([checkout(), checkout()]);
  expect(responses.some((response) => response.status === 200)).toBe(true);
  expect(state.sessions.size).toBe(1);
  expect(state.ads[0].stripeSessionId).toBe("checkout");
  expect(
    state.create.mock.calls
      .map((call) => call[1].idempotencyKey)
      .every((key) => key === state.create.mock.calls[0][1].idempotencyKey),
  ).toBe(true);
});

test("another fixed campaign is excluded while Stripe creation is in flight", async () => {
  state.ads.push(ad(second));
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const create = state.create.getMockImplementation()!;
  state.create.mockImplementation(async (...args) => {
    started();
    await pending;
    return create(...args);
  });
  const firstRequest = checkout();
  await ready;
  expect((await checkout(second)).status).toBe(409);
  release();
  expect((await firstRequest).status).toBe(200);
});

test("a timeout retains the reservation and retry uses the same creation key", async () => {
  const create = state.create.getMockImplementation()!;
  state.create.mockImplementationOnce(async (...args) => {
    await create(...args);
    throw new Error("Timeout after create");
  });
  expect((await checkout()).status).toBe(503);
  expect(state.ads[0].checkoutExpiresAt).toBeInstanceOf(Date);
  expect((await checkout()).status).toBe(200);
  expect(state.sessions.size).toBe(1);
  expect(state.create.mock.calls[0][1]).toEqual(state.create.mock.calls[1][1]);
});

test("a definitive Stripe rejection releases the fixed slot reservation", async () => {
  state.create.mockImplementationOnce(async () => {
    throw Object.assign(new Error("Invalid request"), { statusCode: 400 });
  });
  expect((await checkout()).status).toBe(503);
  expect(state.ads[0].checkoutExpiresAt).toBeNull();
});

test("a Stripe server error keeps the reservation for the retry", async () => {
  state.create.mockImplementationOnce(async () => {
    throw Object.assign(new Error("Stripe is down"), { statusCode: 503 });
  });
  expect((await checkout()).status).toBe(503);
  expect(state.ads[0].checkoutExpiresAt).toBeInstanceOf(Date);
});

test("open sessions are retrieved outside the lock and reused", async () => {
  state.ads[0].stripeSessionId = "existing";
  state.retrieve.mockImplementation(async () => {
    expect(scope.getStore()).not.toBe(true);
    return { status: "open", url: "https://checkout.stripe.com/existing" };
  });
  expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.com/existing" });
  expect(state.create).not.toHaveBeenCalled();
});

test("checkout results cannot overwrite a changed campaign", async () => {
  state.create.mockImplementation(async (params) => {
    state.ads[0].status = "rejected";
    return { id: "stale", url: "https://checkout.stripe.com/stale", expires_at: params.expires_at };
  });
  expect((await checkout()).status).toBe(409);
  expect(state.ads[0].stripeSessionId).toBeNull();
});

test("failed fixed-slot refunds remain rejected and retry even after the slot becomes free", async () => {
  state.ads[0].stripeSessionId = "paid-session";
  state.ads.push({ ...ad(second), status: "active", endsAt: new Date(Date.now() + 60_000) });
  state.refund.mockRejectedValueOnce(new Error("Refund timeout"));
  await expect(activatePaidAd(paidSession())).rejects.toThrow("Refund timeout");
  expect(state.ads[0].status).toBe("rejected");
  expect(state.ads[0].reviewReason).toContain("refund pending");
  state.ads.pop();
  await activatePaidAd(paidSession());
  expect(state.ads[0].status).toBe("rejected");
  expect(state.ads[0].reviewReason).toBe("Fixed slot unavailable; payment refunded");
  expect(state.refund.mock.calls.map((call) => call[1])).toEqual([
    { idempotencyKey: "ad-fixed-conflict-paid-session" },
    { idempotencyKey: "ad-fixed-conflict-paid-session" },
  ]);
  await activatePaidAd(paidSession());
  expect(state.refund).toHaveBeenCalledTimes(2);
});

test("duplicate paid webhooks activate a free fixed slot only once", async () => {
  state.ads[0].stripeSessionId = "paid-session";
  await Promise.all([activatePaidAd(paidSession()), activatePaidAd(paidSession())]);
  expect(state.ads[0].status).toBe("active");
  expect(state.refund).not.toHaveBeenCalled();
});
