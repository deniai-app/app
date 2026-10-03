import { beforeEach, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "../trpc";

const mocks = vi.hoisted(() => ({
  eligible: true,
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  rows: [] as unknown[],
}));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/usage", () => ({ canCompareModels: async () => mocks.eligible }));

import { chatRouter } from "./chat";
import { modelComparisons } from "@/db/schema";
import { models } from "@/lib/constants";
import { comparisonSettingsSchema } from "@/lib/comparison-settings";

const messages = [
  { id: "q", role: "user", parts: [{ type: "text", text: "Compare this" }] },
  {
    id: "a",
    role: "assistant",
    parts: [{ type: "text", text: "Answer" }],
    metadata: { pending: true },
  },
];
const input = () => ({
  leftModel: models[0].value,
  rightModel: models[1].value,
  leftMessages: messages,
  rightMessages: messages,
});
const caller = () =>
  chatRouter.createCaller({
    db: {
      insert: mocks.insert,
      update: mocks.update,
      select: mocks.select,
    } as unknown as Context["db"],
    session: { session: { userId: "owner" } } as Context["session"],
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eligible = true;
  mocks.rows = [];
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [{ id: "saved" }] });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where.mockImplementation(() => ({
    returning: async () => mocks.rows,
    limit: async () => mocks.rows,
    orderBy: async () => mocks.rows,
  }));
});

function expectOwnerFilter() {
  const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
  expect(query.sql).toContain('"model_comparisons"."user_id"');
  expect(query.params).toContain("owner");
}

test("saves both complete histories and model identities without pending metadata", async () => {
  const history = [
    ...messages,
    { id: "q2", role: "user", parts: [{ type: "text", text: "More?" }] },
    { id: "a2", role: "assistant", parts: [{ type: "text", text: "More." }] },
  ];
  expect(
    await caller().saveComparisonSession({
      ...input(),
      leftMessages: history,
      rightMessages: history,
    }),
  ).toBe("saved");
  expect(mocks.insert).toHaveBeenCalledWith(modelComparisons);
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({
      uid: "owner",
      title: "Compare this",
      leftName: models[0].name,
      rightName: models[1].name,
      leftMessages: history.map((message) => ({ ...message, metadata: undefined })),
      rightMessages: history.map((message) => ({ ...message, metadata: undefined })),
    }),
  );
});

test("persists independent settings and restores them with both histories", async () => {
  const leftSettings = comparisonSettingsSchema.parse({
    reasoningEffort: "low",
    webSearch: true,
    enabledTools: ["search"],
  });
  const rightSettings = comparisonSettingsSchema.parse({
    reasoningEffort: "high",
    enabledTools: [],
  });
  await caller().saveComparisonSession({ ...input(), leftSettings, rightSettings });
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({ leftSettings, rightSettings }),
  );
  mocks.rows = [
    { id: "saved", leftSettings, rightSettings, leftMessages: messages, rightMessages: messages },
  ];
  expect(await caller().getComparison({ id: "saved" })).toMatchObject({
    leftSettings,
    rightSettings,
  });
});

test("old saved comparisons load default settings", async () => {
  mocks.rows = [
    {
      id: "saved",
      leftSettings: {},
      rightSettings: {},
      leftMessages: messages,
      rightMessages: messages,
    },
  ];
  expect(await caller().getComparison({ id: "saved" })).toMatchObject({
    leftSettings: comparisonSettingsSchema.parse({}),
    rightSettings: comparisonSettingsSchema.parse({}),
  });
});

test("invalid settings cannot be persisted", async () => {
  await expect(
    caller().saveComparisonSession({
      ...input(),
      leftSettings: { enabledTools: ["image"] } as never,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("updates a saved comparison instead of inserting a duplicate and scopes it to the owner", async () => {
  mocks.rows = [{ id: "saved" }];
  expect(await caller().saveComparisonSession({ ...input(), id: "saved" })).toBe("saved");
  expect(mocks.insert).not.toHaveBeenCalled();
  expectOwnerFilter();
});

test("cannot update a missing or another user's comparison", async () => {
  await expect(caller().saveComparisonSession({ ...input(), id: "other" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expectOwnerFilter();
});

test("rejects saving without an eligible plan", async () => {
  mocks.eligible = false;
  await expect(caller().saveComparisonSession(input())).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("rejects unknown or identical models, incomplete answers, and mismatched questions", async () => {
  for (const invalid of [
    { ...input(), leftModel: "unknown" },
    { ...input(), rightModel: models[0].value },
    { ...input(), rightMessages: [messages[0], { ...messages[1], parts: [] }] },
    {
      ...input(),
      rightMessages: [
        { ...messages[0], parts: [{ type: "text", text: "Different" }] },
        messages[1],
      ],
    },
  ])
    await expect(caller().saveComparisonSession(invalid)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("saved histories remain readable after downgrade and are owner-scoped", async () => {
  mocks.eligible = false;
  mocks.rows = [{ id: "saved", leftMessages: messages, rightMessages: messages }];
  const saved = await caller().getComparison({ id: "saved" });
  expect(saved.leftMessages).toHaveLength(2);
  expect(saved.rightMessages).toHaveLength(2);
  expectOwnerFilter();
});

test("getComparison does not expose another user's comparison", async () => {
  await expect(caller().getComparison({ id: "other" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expectOwnerFilter();
});

test("the list selects summaries only and filters by owner", async () => {
  mocks.rows = [{ id: "saved", title: "Compare this" }];
  expect(await caller().getComparisons()).toEqual(mocks.rows);
  expect(mocks.select.mock.calls[0][0]).not.toHaveProperty("leftMessages");
  expect(mocks.select.mock.calls[0][0]).not.toHaveProperty("rightMessages");
  expectOwnerFilter();
});
