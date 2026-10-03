import type { UIMessage } from "ai";
import { afterEach, expect, test, vi } from "vitest";
import { createModelComparisonTransport } from "./model-comparison-transport";

const messages: UIMessage[] = [
  { id: "question", role: "user", parts: [{ type: "text", text: "Compare this answer" }] },
];

afterEach(() => vi.unstubAllGlobals());

test("both comparison requests use their explicit ID, not the local useChat ID", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response("test response", { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const transport = createModelComparisonTransport();

  for (const side of ["left", "right"]) {
    await expect(
      transport.sendMessages({
        chatId: `local-${side}`,
        messages,
        trigger: "submit-message",
        messageId: "question",
        body: { id: `persisted-${side}`, model: `model-${side}` },
        abortSignal: undefined,
      }),
    ).rejects.toThrow("test response");
  }

  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [index, side] of ["left", "right"].entries()) {
    const [url, options] = fetch.mock.calls[index];
    expect(url).toBe("/api/chat");
    expect(JSON.parse(options.body)).toEqual({
      id: `persisted-${side}`,
      model: `model-${side}`,
      comparison: true,
      messages,
      trigger: "submit-message",
      messageId: "question",
    });
  }
});

test("each model request retains its own effort, search, tool and mode settings", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response("test response", { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const options = [
    {
      reasoningEffort: "high",
      webSearch: true,
      deepResearch: true,
      proMode: true,
      fastMode: false,
      enabledTools: ["search", "browse"],
    },
    {
      reasoningEffort: "low",
      webSearch: false,
      deepResearch: false,
      proMode: false,
      fastMode: true,
      enabledTools: [],
    },
  ];
  for (const [index, settings] of options.entries()) {
    await expect(
      createModelComparisonTransport().sendMessages({
        chatId: `local-${index}`,
        messages,
        trigger: "submit-message",
        messageId: "question",
        body: { id: `side-${index}`, model: `model-${index}`, ...settings },
        abortSignal: undefined,
      }),
    ).rejects.toThrow("test response");
    expect(JSON.parse(fetch.mock.calls[index][1].body)).toMatchObject(settings);
  }
});

test("a missing comparison ID fails before any request is sent", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    createModelComparisonTransport().sendMessages({
      chatId: "local-only",
      messages,
      trigger: "submit-message",
      messageId: "question",
      abortSignal: undefined,
    }),
  ).rejects.toThrow("A comparison request ID is required.");
  expect(fetch).not.toHaveBeenCalled();
});
