import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eligible: true,
  getChat: vi.fn(),
  updateChat: vi.fn(),
  replaceMessage: vi.fn(),
  clearState: vi.fn(),
  checkActive: vi.fn(),
  projectPrompt: vi.fn(),
  consume: vi.fn(),
  streamText: vi.fn(),
  resolveModel: vi.fn(),
  webTools: false,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ session: { userId: "user" }, user: {} }) } },
}));
vi.mock("@/lib/chat", () => ({
  getChatById: mocks.getChat,
  updateChat: mocks.updateChat,
  replaceLastChatMessage: mocks.replaceMessage,
  clearChatGenerationState: mocks.clearState,
  isChatGenerationActive: mocks.checkActive,
  generateTitle: vi.fn(),
}));
vi.mock("@/lib/project-context", () => ({ buildProjectPrompt: mocks.projectPrompt }));
vi.mock("@/lib/usage", () => ({
  canCompareModels: async () => mocks.eligible,
  consumeUsage: mocks.consume,
  refundUsage: vi.fn(),
  UsageLimitError: class UsageLimitError extends Error {},
}));
vi.mock("@/lib/memory", () => ({
  getUserMemoryState: async () => ({ profile: { autoMemory: false } }),
  buildMemoryPrompt: () => "",
  maybeAutoSaveMemories: vi.fn(),
}));
vi.mock("@/lib/max-mode", () => ({ reportMaxModeUsageToStripe: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/platform-capabilities.server", () => ({
  platformCapabilities: {
    features: {
      get webSearch() {
        return mocks.webTools;
      },
      memory: false,
    },
  },
}));
vi.mock("./_lib/model", () => ({
  resolveChatModelContext: mocks.resolveModel,
  ChatRouteError: class ChatRouteError extends Error {},
  addOpenRouterCacheControl: vi.fn(),
}));

import { POST } from "./route";
import { UsageLimitError } from "@/lib/usage";

const question = { id: "question", role: "user", parts: [{ type: "text", text: "Compare this" }] };
const request = (
  comparison: boolean,
  messages: unknown[] = [question],
  settings: Record<string, unknown> = {},
) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ephemeral-id",
      model: "test-model",
      comparison,
      messages,
      ...settings,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eligible = true;
  mocks.webTools = false;
  mocks.resolveModel.mockResolvedValue({
    model: {},
    providerOptions: {},
    usageCategory: "basic",
    usageUnit: "requests",
    usesOpenRouter: false,
  });
  mocks.getChat.mockResolvedValue(null);
  mocks.consume.mockRejectedValue(new UsageLimitError("Quota exhausted"));
  mocks.streamText.mockImplementation(() => ({
    toUIMessageStream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: "Comparison answer" });
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      }),
  }));
});

test("comparison needs no chat row and still checks normal quota", async () => {
  const response = await POST(request(true));
  expect(response.status).toBe(402);
  expect(mocks.consume).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user", amount: 1 }),
  );
  expect(mocks.getChat).not.toHaveBeenCalled();
  expect(mocks.updateChat).not.toHaveBeenCalled();
  expect(mocks.replaceMessage).not.toHaveBeenCalled();
  expect(mocks.clearState).not.toHaveBeenCalled();
  expect(mocks.checkActive).not.toHaveBeenCalled();
  expect(mocks.projectPrompt).not.toHaveBeenCalled();
});

test("a completed comparison streams an answer without persisting any chat", async () => {
  mocks.consume.mockResolvedValue({ maxModeAmount: 0 });
  const response = await POST(request(true));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Comparison answer");
  expect(mocks.streamText).toHaveBeenCalledOnce();
  expect(mocks.getChat).not.toHaveBeenCalled();
  expect(mocks.updateChat).not.toHaveBeenCalled();
  expect(mocks.replaceMessage).not.toHaveBeenCalled();
  expect(mocks.clearState).not.toHaveBeenCalled();
  expect(mocks.checkActive).not.toHaveBeenCalled();
});

test("Free and Plus cannot start an ephemeral comparison", async () => {
  mocks.eligible = false;
  expect((await POST(request(true))).status).toBe(403);
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.getChat).not.toHaveBeenCalled();
});

test("follow-ups retain each model's own previous answers without creating chats", async () => {
  mocks.consume.mockResolvedValue({ maxModeAmount: 0 });
  for (const side of ["left", "right"]) {
    const response = await POST(
      request(true, [
        question,
        {
          id: `answer-${side}`,
          role: "assistant",
          parts: [{ type: "text", text: `Previous ${side} answer` }],
        },
        { id: `followup-${side}`, role: "user", parts: [{ type: "text", text: "Explain more" }] },
      ]),
    );
    expect(response.status).toBe(200);
    await response.text();
    const input = JSON.stringify(mocks.streamText.mock.calls.at(-1)![0].messages);
    expect(input).toContain(`Previous ${side} answer`);
    expect(input).toContain("Explain more");
    expect(input).not.toContain(`Previous ${side === "left" ? "right" : "left"} answer`);
  }
  expect(mocks.updateChat).not.toHaveBeenCalled();
  expect(mocks.getChat).not.toHaveBeenCalled();
});

test("comparison settings reach model resolution and enforce explicit tool permissions", async () => {
  mocks.webTools = true;
  mocks.consume.mockResolvedValue({ maxModeAmount: 0 });
  for (const enabledTools of [[], ["browse"], ["search"]]) {
    const response = await POST(
      request(true, [question], {
        reasoningEffort: "low",
        proMode: true,
        fastMode: true,
        enabledTools,
        webSearch: true,
        deepResearch: true,
      }),
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.resolveModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasoningEffort: "low", proMode: true, fastMode: true }),
    );
    const args = mocks.streamText.mock.calls.at(-1)![0];
    expect(Object.keys(args.tools)).toEqual(enabledTools);
    expect(args.system).not.toContain("questionnaire");
    if (!enabledTools.includes("search"))
      expect(args.system).not.toMatch(/search tool|Web search is required|Deep research mode/);
    if (!enabledTools.includes("browse")) expect(args.system).not.toContain("browse tool");
  }
});

test("ordinary chat still requires a saved chat", async () => {
  expect((await POST(request(false))).status).toBe(404);
  expect(mocks.getChat).toHaveBeenCalledWith("ephemeral-id", "user");
  expect(mocks.consume).not.toHaveBeenCalled();
});

test("comparison requires a new user question at the end", async () => {
  expect(
    (
      await POST(
        request(true, [
          question,
          { id: "answer", role: "assistant", parts: [{ type: "text", text: "Answer" }] },
        ]),
      )
    ).status,
  ).toBe(400);
  expect(mocks.consume).not.toHaveBeenCalled();
});
