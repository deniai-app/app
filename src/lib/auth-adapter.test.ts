import { beforeEach, expect, test, vi } from "vitest";
import { limitedAuthAdapter } from "./auth-adapter";
import { db } from "@/db/drizzle";

const state = vi.hoisted(() => ({ count: 9, locked: false, transactions: 0 }));
vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: () => () => ({
    id: "drizzle",
    create: async ({ model, data }: { model: string; data: object }) => {
      if (model === "oauthClient") {
        expect(state.locked).toBe(true);
        state.count++;
      }
      return data;
    },
  }),
}));
vi.mock("@/db/drizzle", () => {
  let tail = Promise.resolve();
  return {
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        state.transactions++;
        const tx = {
          execute: async () => {
            state.locked = true;
          },
          select: () => ({
            from: () => ({
              where: async () => {
                expect(state.locked).toBe(true);
                return [{ value: state.count }];
              },
            }),
          }),
        };
        try {
          return await run(tx);
        } finally {
          state.locked = false;
          release();
        }
      },
    },
  };
});
beforeEach(() => {
  state.count = 9;
  state.locked = false;
  state.transactions = 0;
});
test("concurrent OAuth registration cannot exceed the last ownership slot", async () => {
  const adapter = limitedAuthAdapter(db)({});
  const results = await Promise.allSettled(
    ["a", "b"].map((clientId) =>
      adapter.create({ model: "oauthClient", data: { clientId, userId: "user" } }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(state.count).toBe(10);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: "FORBIDDEN" },
  });
});
test("unrelated auth inserts preserve the original adapter behavior", async () => {
  const adapter = limitedAuthAdapter(db)({});
  expect(await adapter.create({ model: "session", data: { userId: "user" } })).toEqual({
    userId: "user",
  });
  expect(state.transactions).toBe(0);
});
