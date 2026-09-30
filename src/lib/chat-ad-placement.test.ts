import assert from "node:assert/strict";
import { test } from "vitest";
import type { UIMessage } from "ai";
import { shouldShowChatAd } from "./chat-ad-placement";

const assistant = {
  id: "answer",
  role: "assistant",
  parts: [{ type: "text", text: "Done" }],
} as UIMessage;
const user = { id: "question", role: "user", parts: [{ type: "text", text: "Hi" }] } as UIMessage;

test("ads appear only after the latest assistant reply is complete", () => {
  const input = {
    status: "ready" as const,
    lastMessage: assistant,
    isWaitingForResponse: false,
    hasError: false,
  };
  assert.equal(shouldShowChatAd(input), true);
  assert.equal(shouldShowChatAd({ ...input, status: "streaming" }), false);
  assert.equal(shouldShowChatAd({ ...input, status: "submitted" }), false);
  assert.equal(shouldShowChatAd({ ...input, lastMessage: user }), false);
  assert.equal(shouldShowChatAd({ ...input, lastMessage: undefined }), false);
  assert.equal(shouldShowChatAd({ ...input, isWaitingForResponse: true }), false);
  assert.equal(shouldShowChatAd({ ...input, hasError: true }), false);
});
