import { describe, expect, test } from "vitest";
import { buildChatSystemPrompt } from "../src/app/api/chat/_lib/prompt";
import {
  createQuestionnaireTool,
  questionnaireToolInputSchema,
  uniqueQuestionnaireParts,
} from "../src/lib/chat-tools/questionnaire";

describe("questionnaire chat tool", () => {
  test("accepts single choice, multiple choice, free text, and skippable questions", () => {
    const questionnaire = questionnaireToolInputSchema.parse({
      title: "Plan the prototype",
      questions: [
        {
          name: "direction",
          prompt: "What should we prototype?",
          required: true,
          choices: [{ value: "web", label: "Web app" }],
          input: { label: "Another direction" },
        },
        {
          name: "signals",
          prompt: "Which signals matter?",
          multiple: true,
          choices: [{ value: "speed", label: "Speed" }],
        },
        {
          name: "timing",
          prompt: "When should we revisit this?",
          required: false,
          input: { label: "Timing" },
        },
      ],
    });

    expect(questionnaire.questions).toHaveLength(3);
    expect(questionnaire.questions[1]?.multiple).toBe(true);
    expect(questionnaire.questions[2]?.required).toBe(false);
  });

  test("bounds questionnaire size and requires an answer key and prompt", () => {
    expect(() => questionnaireToolInputSchema.parse({ title: "Empty", questions: [] })).toThrow();
    expect(() =>
      questionnaireToolInputSchema.parse({
        title: "Missing prompt",
        questions: [{ name: "scope" }],
      }),
    ).toThrow();
    expect(() =>
      questionnaireToolInputSchema.parse({
        title: "Too many",
        questions: Array.from({ length: 9 }, (_, index) => ({
          name: `question-${index}`,
          prompt: "Question",
        })),
      }),
    ).toThrow();
  });

  test("pauses for client input rather than executing on the server", () => {
    expect(createQuestionnaireTool().execute).toBeUndefined();
  });

  test("keeps separate completed questionnaires in the same assistant message", () => {
    const first = { toolCallId: "first", state: "output-available", title: "First question" };
    const second = { toolCallId: "second", state: "output-available", title: "Second question" };
    const updatedFirst = { ...first, title: "Updated first" };
    expect(uniqueQuestionnaireParts([first, second, updatedFirst])).toEqual([updatedFirst, second]);
  });
});

test("the assistant advertises questionnaires without removed generation modes", () => {
  const base = { currentDate: "2026-09-20", persistentMemory: null, projectPrompt: null };
  expect(buildChatSystemPrompt(base)).toContain("questionnaire` tool");
  expect(buildChatSystemPrompt(base)).not.toContain("Video mode");
});
