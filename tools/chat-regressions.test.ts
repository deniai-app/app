import { describe, expect, vi, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import { buildChatSystemPrompt } from "../src/app/api/chat/_lib/prompt";
import {
  historyBefore,
  historyCursorSchema,
  historyCursorTimestamp,
} from "../src/server/api/history-pagination";

// Keep these regression tests entirely local: no real auth, database, or exports.
vi.mock("../src/db/drizzle", () => ({ db: {} }));
vi.mock("../src/lib/auth", () => ({ auth: {} }));
vi.mock("../src/lib/account-export", () => ({ buildAccountExport: vi.fn() }));
vi.mock("../src/lib/security-activity", () => ({ recordSecurityActivity: vi.fn() }));

const { chatRouter } = await import("../src/server/api/routers/chat");
const { accountRouter } = await import("../src/server/api/routers/account");
const { projectsRouter } = await import("../src/server/api/routers/projects");
const { projects, teamUsageAuditLog } = await import("../src/db/schema");

function context(execute: (query: string, params: unknown[]) => unknown[][]) {
  return {
    db: drizzle(async (query, params) => ({ rows: execute(query, params) })),
    session: { session: { userId: "current-user" } },
  } as unknown as Parameters<typeof chatRouter.createCaller>[0];
}

describe("chat instructions", () => {
  const base = { currentDate: "2026-09-20", persistentMemory: null, projectPrompt: null };

  test("ordinary messages do not claim the user requested regeneration", () => {
    expect(buildChatSystemPrompt(base)).not.toContain("previous answer");
  });

  test.each(["retry", "detailed", "concise"] as const)(
    "explicit %s keeps regeneration instructions",
    (responseStyle) => {
      expect(buildChatSystemPrompt({ ...base, responseStyle })).toContain("previous answer");
    },
  );
});

test("chat listing retains older pinned chats beyond the first 100", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => [
    `chat-${index}`,
    "Title",
    null,
    index === 100,
    null,
    [],
    "2026-09-20",
    "2026-09-20",
  ]);
  const caller = chatRouter.createCaller(
    context((query, params) => {
      expect(query).not.toContain(" limit ");
      expect(query).not.toContain('"messages"');
      expect(params).toContain("current-user");
      return rows;
    }),
  );
  const chats = await caller.getChats();
  expect(chats).toHaveLength(101);
  expect(chats.at(-1)?.pinned).toBe(true);
});

describe("project access on chat writes", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  for (const state of ["missing", "other-user", "archived", "active"] as const) {
    test(`${state} project is validated for create and move`, async () => {
      let writes = 0;
      const caller = chatRouter.createCaller(
        context((query) => {
          if (query.startsWith("select")) {
            if (state === "missing") return [];
            const project = {
              id: projectId,
              userId: state === "other-user" ? "other-user" : "current-user",
              organizationId: null,
              archivedAt: state === "archived" ? "2026-09-20" : null,
            };
            return [Object.keys(getTableColumns(projects)).map((key) => project[key] ?? null)];
          }
          writes++;
          return [["chat-id"]];
        }),
      );
      if (state === "active") {
        await caller.createChat({ projectId });
        await caller.updateChat({ id: "chat-id", projectId });
        expect(writes).toBe(2);
      } else {
        await expect(caller.createChat({ projectId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(caller.updateChat({ id: "chat-id", projectId })).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
        expect(writes).toBe(0);
      }
    });
  }

  test("personal chat creation and removing a project remain allowed", async () => {
    const caller = chatRouter.createCaller(
      context((query) => {
        expect(query.startsWith("select")).toBe(false);
        return [["chat-id"]];
      }),
    );
    await caller.createChat();
    await caller.updateChat({ id: "chat-id", projectId: null });
  });
});

test("project creation persists the requested default model", async () => {
  const caller = projectsRouter.createCaller(
    context((query, params) => {
      expect(query.startsWith("insert")).toBe(true);
      expect(params).toContain("chosen-model");
      return [];
    }),
  );
  await caller.create({
    name: "Test",
    description: null,
    instructions: "",
    color: "blue",
    defaultModel: "chosen-model",
  });
});

test("security history uses the last displayed event and preserves sub-millisecond ties", async () => {
  const timestamp = "2026-09-20T01:00:00.123456Z";
  const event = (id: string) => [id, "signed_in", null, null, timestamp, timestamp];
  let page = 0;
  const caller = accountRouter.createCaller(
    context((query, params) => {
      expect(query).toContain(
        'order by "security_activity"."created_at" desc, "security_activity"."id" desc',
      );
      if (page++ === 0) return [event("c"), event("b"), event("a")];
      expect(params).toContain(timestamp);
      expect(params).toContain("b");
      expect(query).toContain("::timestamp");
      expect(query).toContain('"security_activity"."id" <');
      return [event("a")];
    }),
  );
  const first = await caller.securityActivity({ limit: 2 });
  expect(first.items.map((item) => item.id)).toEqual(["c", "b"]);
  expect(first.nextCursor).toEqual({ createdAt: timestamp, id: "b" });
  const second = await caller.securityActivity({ limit: 2, cursor: first.nextCursor! });
  expect(second.items.map((item) => item.id)).toEqual(["a"]);
  expect(second.nextCursor).toBeNull();
});

test("team history preserves the timestamp and uses an ID tie-breaker", async () => {
  const cursor = historyCursorSchema.parse({
    createdAt: "2026-09-20T01:00:00.123456Z",
    id: "event-id",
  });
  const database = drizzle(async (query, params) => {
    expect(query).toContain('"team_usage_audit_log"."created_at" <');
    expect(query).toContain('"team_usage_audit_log"."created_at" =');
    expect(query).toContain('"team_usage_audit_log"."id" <');
    expect(query).toContain(" or ");
    expect(query).toContain("to_char");
    expect(params).toEqual([cursor.createdAt, cursor.createdAt, cursor.id]);
    return { rows: [] };
  });
  await database
    .select({ cursorCreatedAt: historyCursorTimestamp(teamUsageAuditLog.createdAt) })
    .from(teamUsageAuditLog)
    .where(historyBefore(teamUsageAuditLog, cursor));
});

test.each([0, 2])("security history ends cleanly with %i events", async (count) => {
  const timestamp = "2026-09-20T01:00:00.000000Z";
  const caller = accountRouter.createCaller(
    context(() =>
      Array.from({ length: count }, (_, id) => [
        String(id),
        "signed_in",
        null,
        null,
        timestamp,
        timestamp,
      ]),
    ),
  );
  const result = await caller.securityActivity({ limit: 2 });
  expect(result.items).toHaveLength(count);
  expect(result.nextCursor).toBeNull();
});
