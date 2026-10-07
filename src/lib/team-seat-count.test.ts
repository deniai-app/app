import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { updateTeamSeatCount } from "./team-billing";
import { stripe } from "./stripe";

const state = vi.hoisted(() => ({ members: 2, quantity: 1 }));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));
vi.mock("./stripe", () => ({ stripe: { subscriptions: { retrieve: vi.fn(), update: vi.fn() } } }));
vi.mock("./stripe-subscriptions", () => ({
  getLicensedSubscriptionItem: (subscription: { items: { data: unknown[] } }) =>
    subscription.items.data[0],
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    transaction: (() => {
      let tail = Promise.resolve();
      return async (run: (transaction: unknown) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual({ isolationLevel: "read committed" });
        let release: (() => void) | undefined;
        let locked = false;
        const transaction = {
          execute: async (statement: SQL) => {
            expect(new PgDialect().sqlToQuery(statement).sql).toContain("pg_advisory_xact_lock");
            const previous = tail;
            tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            locked = true;
          },
          select: () => ({
            from: (table: Parameters<typeof getTableName>[0]) => ({
              where: () => {
                expect(locked).toBe(true);
                const result = Promise.resolve(
                  getTableName(table) === "member"
                    ? [{ count: state.members }]
                    : [{ stripeSubscriptionId: "subscription" }],
                );
                return Object.assign(result, { orderBy: () => ({ limit: () => result }) });
              },
            }),
          }),
        };
        try {
          return await run(transaction);
        } finally {
          release?.();
        }
      };
    })(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.members = 2;
  state.quantity = 1;
  vi.mocked(stripe.subscriptions.retrieve).mockImplementation(
    async () =>
      ({
        id: "subscription",
        items: { data: [{ id: "licensed", quantity: state.quantity }] },
      }) as never,
  );
  vi.mocked(stripe.subscriptions.update).mockImplementation(async (_id, params) => {
    state.quantity = params?.items?.[0].quantity ?? 0;
    return {} as never;
  });
});

test("a delayed older seat write completes before the next count is read and sent", async () => {
  let release!: () => void;
  vi.mocked(stripe.subscriptions.update).mockImplementationOnce(async (_id, params) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    state.quantity = params?.items?.[0].quantity ?? 0;
    return {} as never;
  });
  const first = updateTeamSeatCount("team");
  await vi.waitFor(() => expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1));
  state.members = 3;
  const second = updateTeamSeatCount("team");
  await Promise.resolve();
  expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(state.quantity).toBe(3);
  expect(
    vi.mocked(stripe.subscriptions.update).mock.calls.map((call) => call[1]?.items?.[0].quantity),
  ).toEqual([2, 3]);
});
