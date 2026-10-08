import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";

type StoredMessage = {
  id: string;
  role: string;
  parts: unknown[];
  metadata?: Record<string, unknown>;
};

const state = vi.hoisted(() => ({
  row: null as null | { activeGenerationId: string | null; messages: StoredMessage[] },
  /** Runs between the stop route's read and its write. */
  betweenReadAndWrite: null as null | (() => void),
  updates: [] as { params: unknown[]; sql: string }[],
}));

vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/openrouter-provider", () => ({ createDeniOpenRouter: vi.fn() }));
vi.mock("@/db/drizzle", () => {
  const dialect = new PgDialect();
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const rows = state.row ? [{ activeGenerationId: state.row.activeGenerationId }] : [];
              state.betweenReadAndWrite?.();
              return rows;
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: { messages: SQL }) => ({
          where: (condition: SQL) => ({
            returning: async () => {
              const where = dialect.sqlToQuery(condition);
              const set = dialect.sqlToQuery(values.messages);
              state.updates.push({ params: [...where.params, ...set.params], sql: set.sql });
              const row = state.row;
              if (!row) return [];
              const expected = where.sql.includes('"active_generation_id" is null')
                ? null
                : where.params.at(-1);
              if (row.activeGenerationId !== expected) return [];
              // Postgres evaluates the CASE / #- expression on the current row.
              const last = row.messages.at(-1);
              if (last?.role === "assistant" && last.metadata?.pending === true) {
                const metadata = { ...last.metadata };
                delete metadata.pending;
                row.messages = [...row.messages.slice(0, -1), { ...last, metadata }];
              }
              row.activeGenerationId = null;
              return [{ id: "chat-1" }];
            },
          }),
        }),
      }),
    },
  };
});

const { stopActiveChatGeneration } = await import("./chat");
const { startChatGeneration, stopChatGeneration, isCurrentChatGeneration, clearChatGeneration } =
  await import("./chat-generation");

const user = (id: string): StoredMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text: id }],
});
const pendingAnswer = (id: string, text: string): StoredMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
  metadata: { pending: true },
});

beforeEach(() => {
  state.row = null;
  state.betweenReadAndWrite = null;
  state.updates = [];
  clearChatGeneration("chat-1", "gen-new");
  clearChatGeneration("chat-1", "gen-old");
});

test("stops the active generation and keeps its partial answer", async () => {
  state.row = {
    activeGenerationId: "gen-old",
    messages: [user("q1"), pendingAnswer("a1", "partial")],
  };
  // The stream persists a longer partial after the stop route read the row.
  state.betweenReadAndWrite = () => {
    state.row!.messages = [user("q1"), pendingAnswer("a1", "partial and newer")];
  };

  expect(await stopActiveChatGeneration("chat-1", "user-1")).toBe("gen-old");
  expect(state.row.activeGenerationId).toBeNull();
  expect(state.row.messages.at(-1)).toEqual({
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "partial and newer" }],
    metadata: {},
  });
});

test("a generation started between the read and the write is left untouched", async () => {
  state.row = {
    activeGenerationId: "gen-old",
    messages: [user("q1"), pendingAnswer("a1", "old answer")],
  };
  const newer = [
    user("q1"),
    pendingAnswer("a1", "old answer"),
    user("q2"),
    pendingAnswer("a2", ""),
  ];
  state.betweenReadAndWrite = () => {
    state.row = { activeGenerationId: "gen-new", messages: structuredClone(newer) };
    startChatGeneration("chat-1", "gen-new");
  };

  const stopped = await stopActiveChatGeneration("chat-1", "user-1");
  expect(stopped).toBeUndefined();
  expect(state.row).toEqual({ activeGenerationId: "gen-new", messages: newer });
  // The old snapshot is never written back as the transcript tail.
  expect(JSON.stringify(state.updates.flatMap((update) => update.params))).not.toContain(
    "old answer",
  );
  expect(stopChatGeneration("chat-1", "gen-old")).toBe(false);
  expect(isCurrentChatGeneration("chat-1", "gen-new")).toBe(true);
});

test("clears a stale pending flag when no generation is active", async () => {
  state.row = { activeGenerationId: null, messages: [user("q1"), pendingAnswer("a1", "done")] };
  expect(await stopActiveChatGeneration("chat-1", "user-1")).toBeNull();
  expect(state.row.messages.at(-1)?.metadata).toEqual({});
});

test.each([["stale"], [{}], [1], [null]])(
  "stops without touching a message whose untrusted pending value is %j",
  async (pending) => {
    const odd = { ...pendingAnswer("a1", "kept"), metadata: { pending, other: "x" } };
    state.row = { activeGenerationId: "gen-old", messages: [user("q1"), structuredClone(odd)] };

    expect(await stopActiveChatGeneration("chat-1", "user-1")).toBe("gen-old");
    expect(state.row.messages.at(-1)).toEqual(odd);
    // Imported metadata is arbitrary JSON: compare as jsonb, never cast its text
    // (a `::boolean` cast of "stale" fails with 22P02 and breaks stopping).
    const [update] = state.updates;
    expect(update.sql).toContain("= 'true'::jsonb");
    expect(update.sql).not.toMatch(/::boolean/i);
  },
);

test("returns undefined for a chat the user does not own", async () => {
  expect(await stopActiveChatGeneration("chat-1", "user-1")).toBeUndefined();
  expect(state.updates).toEqual([]);
});
