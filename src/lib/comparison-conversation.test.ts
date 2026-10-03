import type { UIMessage } from "ai";
import { expect, test } from "vitest";
import { getComparisonTurns, isComparisonConversation } from "./comparison-conversation";

function message(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}
const question = message("q1", "user", "Question");
const answer = message("a1", "assistant", "Answer");
const followup = message("q2", "user", "Follow up");
const secondAnswer = message("a2", "assistant", "More detail");

test("multi-turn generation and saving have distinct last-role requirements", () => {
  expect(isComparisonConversation([question, answer, followup])).toBe(true);
  expect(isComparisonConversation([question, answer, followup], true)).toBe(false);
  expect(isComparisonConversation([question, answer, followup, secondAnswer], true)).toBe(true);
  expect(isComparisonConversation([question, answer, followup, secondAnswer])).toBe(false);
});

test("turns keep each answer next to its question", () => {
  expect(getComparisonTurns([question, answer, followup, secondAnswer])).toEqual([
    { question, answers: [answer] },
    { question: followup, answers: [secondAnswer] },
  ]);
});

test("an unanswered request keeps its own empty row", () => {
  expect(getComparisonTurns([question, followup, secondAnswer])).toEqual([
    { question, answers: [] },
    { question: followup, answers: [secondAnswer] },
  ]);
  expect(isComparisonConversation([question, followup])).toBe(true);
});

test("invalid roles, attachments, empty questions, and oversized histories are rejected", () => {
  expect(isComparisonConversation([])).toBe(false);
  expect(isComparisonConversation([{ ...question, role: "system" }])).toBe(false);
  expect(isComparisonConversation([message("empty", "user", " ")])).toBe(false);
  expect(
    isComparisonConversation([
      {
        ...question,
        parts: [{ type: "file", mediaType: "text/plain", url: "https://example.com/file" }],
      },
    ]),
  ).toBe(false);
  expect(
    isComparisonConversation(
      Array.from({ length: 201 }, (_, index) => message(String(index), "user", "Question")),
    ),
  ).toBe(false);
});
