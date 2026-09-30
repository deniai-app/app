import { existsSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { ChatRequestSchema } from "./schema";
import { createChatTools } from "@/lib/chat-tools";

vi.mock("@/lib/platform-capabilities.server", () => ({
  platformCapabilities: { features: { webSearch: true } },
}));

const request = { id: "chat-id", model: "test-model" };

test.each(["image", "video"])("rejects removed %s generation requests", (mode) => {
  expect(ChatRequestSchema.safeParse({ ...request, [mode]: true }).success).toBe(false);
  expect(ChatRequestSchema.safeParse({ ...request, [mode]: false }).success).toBe(true);
});

test("ordinary requests and tools do not expose generation", () => {
  expect(ChatRequestSchema.safeParse(request).success).toBe(true);
  expect(Object.keys(createChatTools({ webSearch: true }))).toEqual([
    "questionnaire",
    "search",
    "browse",
  ]);
  expect(Object.keys(createChatTools({ webSearch: false }))).toEqual(["questionnaire"]);
});

test("retired generation and video download route handlers are absent", () => {
  expect(existsSync(new URL("../../veo/route.ts", import.meta.url))).toBe(false);
  expect(existsSync(new URL("../../veo/file/route.ts", import.meta.url))).toBe(false);
});
