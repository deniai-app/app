import { Chat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  query: new URLSearchParams(),
  pageFetch: vi.fn(),
  invalidate: vi.fn(),
}));

// Run the real hooks and AI SDK with deterministic scheduling and no network.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef<T>(initial: T) {
    const index = harness.cursor++;
    return (harness.slots[index] ??= { current: initial }) as { current: T };
  },
  useState<T>(initial: T | (() => T)) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      harness.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    }
    return [
      harness.slots[index] as T,
      (next: T | ((previous: T) => T)) => {
        harness.slots[index] =
          typeof next === "function"
            ? (next as (previous: T) => T)(harness.slots[index] as T)
            : next;
      },
    ] as const;
  },
  useEffect(effect: () => void | (() => void)) {
    harness.effects.push(effect);
  },
  useCallback<T>(callback: T) {
    return callback;
  },
  useMemo<T>(factory: () => T) {
    return factory();
  },
  useSyncExternalStore<T>(_subscribe: unknown, snapshot: () => T) {
    return snapshot();
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => harness.query }));
vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      chat: { getChatPage: { fetch: harness.pageFetch, invalidate: harness.invalidate } },
      billing: { usage: { invalidate: harness.invalidate } },
    }),
  },
}));

import { groupMessages, useChatBranches } from "./use-chat-branches";
import { useChatPageSync } from "./use-chat-page-sync";
import { useInitialMessage } from "./use-initial-message";
import { mergeMessageWindow, sliceLatestMessages, sliceOlderMessages } from "@/lib/chat-messages";
import { models } from "@/lib/constants";

beforeEach(() => {
  vi.clearAllMocks();
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.query = new URLSearchParams();
  vi.stubGlobal("window", { history: { replaceState: vi.fn() } });
  vi.stubGlobal("sessionStorage", { getItem: () => null, removeItem: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

function render<T>(callback: () => T): T {
  harness.cursor = 0;
  harness.effects = [];
  const result = callback();
  for (const effect of harness.effects) effect();
  return result;
}

function message(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

const conversation = () => [
  message("q1", "user", "Question one"),
  message("a1", "assistant", "Answer one"),
  message("q2", "user", "Question two"),
  message("a2", "assistant", "Answer two"),
];

async function regenerateAt(messages: UIMessage[], target?: string) {
  const sent: UIMessage[][] = [];
  const chat = new Chat({
    messages,
    transport: {
      sendMessages: async (options) => {
        sent.push(options.messages);
        const chunks: UIMessageChunk[] = [
          { type: "start", messageId: "new-answer" },
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "Regenerated answer" },
          { type: "text-end", id: "text" },
          { type: "finish", finishReason: "stop" },
        ];
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        });
      },
      reconnectToStream: async () => null,
    },
  });
  const setMessages = vi.fn((update: UIMessage[] | ((previous: UIMessage[]) => UIMessage[])) => {
    chat.messages = typeof update === "function" ? update(chat.messages) : update;
  });
  const hook = render(() =>
    useChatBranches({ messages: chat.messages, setMessages, regenerate: chat.regenerate }),
  );
  hook.handleRegenerate(target ? { messageId: target } : undefined);
  await vi.waitFor(() => expect(setMessages).toHaveBeenCalledOnce());
  expect(chat.error).toBeUndefined();
  return { chat, sent, grouped: groupMessages(chat.messages) };
}

test("regeneration without an ID keeps the last answer's alternatives", async () => {
  const { grouped, sent } = await regenerateAt(conversation());
  expect(sent[0].map((item) => item.id)).toEqual(["q1", "a1", "q2"]);
  expect(grouped.at(-1)).toMatchObject({
    type: "branch",
    messages: [{ id: "a2" }, { id: "new-answer" }],
  });
});

test("regenerating an older answer keeps the replacement under its own question", async () => {
  const { chat, grouped, sent } = await regenerateAt(conversation(), "a1");
  expect(sent[0].map((item) => item.id)).toEqual(["q1"]);
  expect(chat.messages.map((item) => item.id)).toEqual(["q1", "a1", "new-answer"]);
  expect(grouped.at(-1)).toMatchObject({
    type: "branch",
    messages: [{ id: "a1" }, { id: "new-answer" }],
  });
});

test("regenerating an earlier alternative preserves the other alternatives for that question", async () => {
  const messages = conversation();
  messages[1].metadata = { branchGroupId: "existing" };
  messages.splice(2, 0, {
    ...message("a1-alternative", "assistant", "Another answer one"),
    metadata: { branchGroupId: "existing" },
  });
  const { chat, grouped } = await regenerateAt(messages, "a1");
  expect(chat.messages.map((item) => item.id)).toEqual([
    "q1",
    "a1",
    "a1-alternative",
    "new-answer",
  ]);
  expect(grouped.at(-1)).toMatchObject({
    type: "branch",
    groupId: "existing",
    messages: [{ id: "a1" }, { id: "a1-alternative" }, { id: "new-answer" }],
  });
});

async function recoverPending(current: UIMessage[], serverMessages: UIMessage[]) {
  harness.pageFetch.mockResolvedValue({ messages: serverMessages });
  const setMessages = vi.fn((update: UIMessage[] | ((previous: UIMessage[]) => UIMessage[])) => {
    current = typeof update === "function" ? update(current) : update;
  });
  const params = {
    id: "chat",
    status: "ready" as const,
    isWaitingForResponse: true,
    activeGenerationId: null,
    statusUpdatedAt: new Date("2026-10-08T00:00:00Z"),
    isStatusSuccess: true,
    setMessages,
  };
  render(() => useChatPageSync(params));
  await vi.waitFor(() => expect(setMessages).toHaveBeenCalledOnce());
  render(() => useChatPageSync(params));
  expect(harness.pageFetch).toHaveBeenCalledOnce();
  return current;
}

function pendingConversation() {
  const complete = Array.from({ length: 5 }, (_, index) => [
    message(`q${index + 1}`, "user", `Question ${index + 1}`),
    message(`a${index + 1}`, "assistant", `Completed ${index + 1}`),
  ]).flat();
  const pending = complete.map((item, index) =>
    index === complete.length - 1 ? { ...item, parts: [], metadata: { pending: true } } : item,
  );
  return { complete, pending };
}

test("the initial five-message window recovers a completed answer", async () => {
  const { complete, pending } = pendingConversation();
  const result = await recoverPending(
    sliceLatestMessages(pending).messages,
    sliceLatestMessages(complete).messages,
  );
  expect(result.at(-1)).toEqual(complete.at(-1));
});

test("loading older history still recovers the answer and preserves that history", async () => {
  const { complete, pending } = pendingConversation();
  const initial = sliceLatestMessages(pending);
  const current = mergeMessageWindow(
    sliceOlderMessages(pending, initial.oldestIndex).messages,
    initial.messages,
  );
  expect(await recoverPending(current, sliceLatestMessages(complete).messages)).toEqual(complete);
});

test("a stale server page does not replace a newer local question", async () => {
  const { complete, pending } = pendingConversation();
  const stale = sliceLatestMessages(complete.slice(0, -2)).messages;
  expect(await recoverPending(pending, stale)).toEqual(pending);
});

test("an assistant-only server window recovers the matching pending message", async () => {
  const complete = [
    message("question", "user", "Question"),
    ...Array.from({ length: 6 }, (_, index) => message(`answer-${index}`, "assistant", "Answer")),
  ];
  const pending = complete.map((item, index) =>
    index === complete.length - 1 ? { ...item, parts: [], metadata: { pending: true } } : item,
  );
  expect(await recoverPending(pending, sliceLatestMessages(complete).messages)).toEqual(complete);
});

test.each([
  "Explain URLs",
  "Explain %20 and %2F in URLs",
  "100% complete, even with %invalid",
  "Keep +, &, and ? literally",
  "日本語の質問\n次の行にも %E3%81%82 をそのまま残す",
])("a URL prompt is preserved exactly and is never sent automatically: %s", (prompt) => {
  harness.query = new URLSearchParams(new URLSearchParams({ message: prompt }).toString());
  const onDraft = vi.fn();
  const sendMessage = vi.fn();
  render(() =>
    useInitialMessage({
      id: "chat",
      initialMessagesLength: 0,
      model: models[0].value,
      sendMessage,
      onMessageSent: vi.fn(),
      onDraft,
    }),
  );
  expect(onDraft).toHaveBeenCalledExactlyOnceWith(prompt);
  expect(sendMessage).not.toHaveBeenCalled();
});
