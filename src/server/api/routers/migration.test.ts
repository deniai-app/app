import { beforeEach, expect, test, vi } from "vitest";
import type { Context } from "../trpc";

vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));

const { migrationRouter } = await import("./migration");
const { normalizeMigrationPayload } = await import("@/lib/migration");

/** postgres.js rejects statements with this many bind parameters (MAX_PARAMETERS_EXCEEDED). */
const DRIVER_MAX_PARAMETERS = 65_534;
/** uid, title, messages, created_at, updated_at. */
const PARAMETERS_PER_CHAT = 5;

const state = vi.hoisted(() => ({
  committed: [] as unknown[][],
  largestStatement: 0,
  failOnBatch: null as number | null,
}));

function payload(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Chat ${index}`,
    messages: [{ role: "user", content: `Question ${index}` }],
  }));
}

/** A driver-like INSERT that enforces postgres.js' bind parameter limit. */
function driver(pending: unknown[][]) {
  return {
    insert: () => ({
      values: (rows: unknown[]) => ({
        returning: async () => {
          const parameters = rows.length * PARAMETERS_PER_CHAT;
          state.largestStatement = Math.max(state.largestStatement, parameters);
          if (parameters >= DRIVER_MAX_PARAMETERS) throw new Error("MAX_PARAMETERS_EXCEEDED");
          if (state.failOnBatch === pending.length) throw new Error("insert failed");
          pending.push(rows);
          return rows.map((_, index) => ({ id: `chat-${index}` }));
        },
      }),
    }),
  };
}

const caller = () =>
  migrationRouter.createCaller({
    db: {
      // Statements outside a transaction commit immediately.
      ...driver(state.committed),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const pending: unknown[][] = [];
        const result = await run(driver(pending));
        state.committed.push(...pending);
        return result;
      },
    } as unknown as Context["db"],
    session: { session: { userId: "user-1" } } as Context["session"],
  });

beforeEach(() => {
  state.committed = [];
  state.failOnBatch = null;
  state.largestStatement = 0;
});

test("imports more tiny chats than one statement can bind", async () => {
  // Small enough for the 25 MB payload cap, but 70,000 bind parameters in one INSERT.
  const total = 14_000;
  const result = await caller().import({ payload: payload(total) });

  expect(result).toMatchObject({ success: true, importedChats: total, importedMessages: total });
  expect(state.committed.flat()).toHaveLength(total);
  expect(state.largestStatement).toBeGreaterThan(0);
  expect(state.largestStatement).toBeLessThan(DRIVER_MAX_PARAMETERS);
});

test("a failing later statement rolls back the whole import", async () => {
  state.failOnBatch = 1;
  await expect(caller().import({ payload: payload(14_000) })).rejects.toThrow("insert failed");
  expect(state.committed).toEqual([]);
});

test("strips NUL characters that Postgres rejects from imported titles and messages", () => {
  const { conversations } = normalizeMigrationPayload([
    {
      title: "Bad\u0000title",
      messages: [
        { role: "user", content: "Hello\u0000world" },
        { role: "assistant", content: "Fine\u0000" },
      ],
    },
  ]);

  expect(conversations).toHaveLength(1);
  expect(conversations[0].title).toBe("Badtitle");
  expect(JSON.stringify(conversations[0].messages)).not.toContain("\\u0000");
  expect(JSON.stringify(conversations[0].messages)).toContain("Helloworld");
});
