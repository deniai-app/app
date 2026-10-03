import { beforeEach, expect, test, vi } from "vitest";
import type { Context } from "../trpc";

const mocks = vi.hoisted(() => ({ eligible: true, values: vi.fn(), insert: vi.fn() }));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/usage", () => ({ canCompareModels: async () => mocks.eligible }));

import { chatRouter } from "./chat";

const messages = [
  { id: "question", role: "user", parts: [{ type: "text", text: "My comparison question" }] },
  {
    id: "answer",
    role: "assistant",
    parts: [{ type: "text", text: "Selected answer" }],
    metadata: { pending: true },
  },
];
const caller = () =>
  chatRouter.createCaller({
    db: { insert: mocks.insert } as unknown as Context["db"],
    session: { session: { userId: "user" } } as Context["session"],
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eligible = true;
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [{ id: "saved-chat" }] });
});

test("Continue saves one selected question/answer pair, with no pending metadata", async () => {
  expect(await caller().saveComparison({ messages })).toBe("saved-chat");
  expect(mocks.insert).toHaveBeenCalledOnce();
  expect(mocks.values).toHaveBeenCalledWith({
    uid: "user",
    title: "My comparison question",
    messages: messages.map((message) => ({ ...message, metadata: undefined })),
  });
});

test("Continue saves the full selected conversation after follow-ups", async () => {
  const history = [
    ...messages,
    { id: "followup", role: "user", parts: [{ type: "text", text: "Explain more" }] },
    { id: "second-answer", role: "assistant", parts: [{ type: "text", text: "More detail" }] },
  ];
  expect(await caller().saveComparison({ messages: history })).toBe("saved-chat");
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: history.map((message) => ({ ...message, metadata: undefined })),
    }),
  );
});

test("Free and Plus cannot save a comparison through the API", async () => {
  mocks.eligible = false;
  await expect(caller().saveComparison({ messages })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("an empty assistant answer is not saved", async () => {
  await expect(
    caller().saveComparison({ messages: [messages[0], { ...messages[1], parts: [] }] }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("only a user question followed by an assistant answer can be saved", async () => {
  await expect(
    caller().saveComparison({ messages: [...messages].reverse() }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.insert).not.toHaveBeenCalled();
});
