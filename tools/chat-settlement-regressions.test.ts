import type { UIMessage } from "ai";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeGenerationId: null as string | null,
  mode: "stopped" as "stopped" | "replaced" | "finished",
  output: true,
  guest: false,
  usage: true,
  consumed: 0,
  refunded: 0,
  reported: 0,
  settled: 0,
  inputTokens: 10,
  limitReached: false,
  failSettlement: false,
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ session: { userId: "user" }, user: { isAnonymous: state.guest } }),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/chat", () => ({
  getChatById: async () => ({ id: "chat", title: "Existing", messages: [], projectId: null }),
  getChatGenerationContextById: async () => ({ id: "chat", title: "Existing", projectId: null }),
  updateChat: vi.fn(async (_id, _user, _messages, _title, options) => {
    state.activeGenerationId = options.nextGenerationId ?? state.activeGenerationId;
  }),
  isChatGenerationActive: async (_id: string, _user: string, generation: string) =>
    state.activeGenerationId === generation,
  stopChatGenerationState: async () => {
    state.activeGenerationId = null;
  },
  removePendingAssistantMessage: async () => false,
  replaceLastChatMessage: vi.fn(),
  clearChatGenerationState: vi.fn(async () => {
    state.activeGenerationId = null;
    return "chat";
  }),
  generateTitle: vi.fn(),
}));
vi.mock("@/lib/memory", () => ({
  getUserMemoryState: async () => ({ profile: { autoMemory: false } }),
  buildMemoryPrompt: () => null,
  maybeAutoSaveMemories: vi.fn(),
}));
vi.mock("@/lib/project-context", () => ({ buildProjectPrompt: async () => null }));
vi.mock("@/lib/chat-tools", () => ({ createChatTools: () => ({}) }));
vi.mock("@/lib/platform-capabilities.server", () => ({
  platformCapabilities: { features: { memory: false, webSearch: false } },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/usage", async () => {
  class UsageLimitError extends Error {}
  return {
    UsageLimitError,
    consumeUsage: vi.fn(
      async ({ amount, allowLimitOverflow }: { amount: number; allowLimitOverflow?: boolean }) => {
        const settling = state.consumed > 0;
        if (settling && state.failSettlement) throw new Error("Quota write failed");
        if (settling && state.limitReached && !allowLimitOverflow) throw new UsageLimitError();
        state.consumed += amount;
        return { maxModeAmount: state.guest ? 0 : amount };
      },
    ),
    refundUsage: vi.fn(async ({ amount }: { amount: number }) => {
      state.refunded += amount;
      state.settled++;
      return { maxModeRefunded: state.guest ? 0 : amount };
    }),
  };
});
vi.mock("@/lib/max-mode", () => ({
  reportMaxModeUsageToStripe: vi.fn(async (_user, _category, amount) => {
    state.reported += amount;
  }),
}));
vi.mock("@/app/api/chat/_lib/model", async () => {
  class ChatRouteError extends Error {}
  return {
    ChatRouteError,
    addOpenRouterCacheControl: vi.fn(),
    resolveChatModelContext: async () => ({
      model: {},
      providerOptions: {},
      usageCategory: "basic",
      usageUnit: state.guest ? "requests" : "tokens",
      usesOpenRouter: false,
    }),
  };
});
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return { ...actual, getEffectiveTokenMultiplier: () => 1 };
});
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn((options) => ({
      toUIMessageStream: () =>
        new ReadableStream({
          async start(controller) {
            if (state.usage)
              await options.onStepFinish({
                usage: { inputTokens: state.inputTokens, outputTokens: 2 },
              });
            if (state.mode === "stopped") {
              const { POST } = await import("@/app/api/chat/stop/route");
              await POST(
                new Request("http://localhost/api/chat/stop", {
                  method: "POST",
                  body: JSON.stringify({ id: "chat" }),
                }),
              );
            } else if (state.mode === "replaced") {
              const { startChatGeneration } = await import("@/lib/chat-generation");
              startChatGeneration("chat", "new-generation");
              state.activeGenerationId = "new-generation";
            } else if (state.usage) {
              await options.onFinish({
                totalUsage: { inputTokens: state.inputTokens, outputTokens: 2 },
              });
            }
            if (state.output) {
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({ type: "text-delta", id: "text", delta: "Partial answer" });
              controller.enqueue({ type: "text-end", id: "text" });
            }
            controller.enqueue({ type: state.mode === "finished" ? "finish" : "abort" });
            controller.close();
          },
        }),
    })),
  };
});

const { POST } = await import("../src/app/api/chat/route");
const { clearChatGenerationState, replaceLastChatMessage } = await import("@/lib/chat");
const { clearChatGeneration, isCurrentChatGeneration } = await import("@/lib/chat-generation");

beforeEach(() => {
  vi.clearAllMocks();
  state.activeGenerationId = null;
  state.mode = "stopped";
  state.output = true;
  state.guest = false;
  state.usage = true;
  state.consumed = 0;
  state.refunded = 0;
  state.reported = 0;
  state.settled = 0;
  state.inputTokens = 10;
  state.limitReached = false;
  state.failSettlement = false;
});

async function run() {
  const messages: UIMessage[] = [
    { id: "user-message", role: "user", parts: [{ type: "text", text: "Hello" }] },
  ];
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ id: "chat", model: "gpt-5.6-luna", messages }),
    }),
  );
  expect(response.status).toBe(200);
  await response.text();
}

test.each(["stopped", "replaced"] as const)(
  "%s generations reconcile usage without writing a stale transcript",
  async (mode) => {
    state.mode = mode;
    await run();
    expect(state.consumed).toBeGreaterThan(20);
    expect(state.consumed - state.refunded).toBe(20);
    expect(state.reported).toBe(20);
    expect(state.settled).toBe(1);
    expect(clearChatGenerationState).not.toHaveBeenCalled();
    expect(replaceLastChatMessage).not.toHaveBeenCalled();
    if (mode === "replaced") {
      expect(isCurrentChatGeneration("chat", "new-generation")).toBe(true);
      clearChatGeneration("chat", "new-generation");
    }
  },
);

test("stopping before any output refunds the entire reservation", async () => {
  state.output = false;
  state.usage = false;
  await run();
  expect(state.refunded).toBe(state.consumed);
  expect(state.reported).toBe(0);
});

test("aborted output with no provider usage never retains the full reservation", async () => {
  state.usage = false;
  await run();
  expect(state.consumed - state.refunded).toBe(1);
  expect(state.reported).toBe(1);
});

test("normal completion settles once and finalizes the owned transcript", async () => {
  state.mode = "finished";
  await run();
  expect(state.consumed - state.refunded).toBe(20);
  expect(state.reported).toBe(20);
  expect(state.settled).toBe(1);
  expect(clearChatGenerationState).toHaveBeenCalledOnce();
});

test("a guest stop before output refunds the request unit", async () => {
  state.guest = true;
  state.output = false;
  state.usage = false;
  await run();
  expect(state.consumed).toBe(1);
  expect(state.refunded).toBe(1);
  expect(state.reported).toBe(0);
});

test("usage above the reservation is billed even past the plan limit", async () => {
  state.mode = "finished";
  state.inputTokens = 500_000;
  state.limitReached = true;
  await run();
  expect(state.consumed - state.refunded).toBe(500_010);
  expect(state.reported).toBe(500_010);
  expect(clearChatGenerationState).toHaveBeenCalledOnce();
});

test("a failed settlement keeps the streamed answer in the transcript", async () => {
  state.mode = "finished";
  state.inputTokens = 500_000;
  state.failSettlement = true;
  await run();
  expect(clearChatGenerationState).toHaveBeenCalledOnce();
});
