import { expect, test } from "vitest";
import { comparisonSettingsSchema, normalizeComparisonSettings } from "./comparison-settings";
import { models } from "./constants";
import { buildChatSystemPrompt } from "@/app/api/chat/_lib/prompt";

const defaults = () => comparisonSettingsSchema.parse({});

test("older saved comparisons get the existing generation defaults", () => {
  expect(defaults()).toEqual({
    reasoningEffort: "high",
    webSearch: false,
    deepResearch: false,
    proMode: false,
    fastMode: false,
    enabledTools: ["search", "browse"],
  });
});

test("model switching resolves unsupported effort and disables unsupported modes", () => {
  const model = {
    ...models[0],
    efforts: ["low", "medium"] as const,
    supportsProMode: false,
    supportsFastMode: false,
  };
  expect(
    normalizeComparisonSettings(model, {
      ...defaults(),
      reasoningEffort: "max",
      proMode: true,
      fastMode: true,
    }),
  ).toEqual(
    expect.objectContaining({ reasoningEffort: "medium", proMode: false, fastMode: false }),
  );
});

test("disabling search disables forced lookup and deep research, but retains browse", () => {
  expect(
    normalizeComparisonSettings(models[0], {
      ...defaults(),
      webSearch: true,
      deepResearch: true,
      enabledTools: ["browse"],
    }),
  ).toEqual(
    expect.objectContaining({ webSearch: false, deepResearch: false, enabledTools: ["browse"] }),
  );
});

test("deep research implies search and duplicate tools are removed", () => {
  expect(
    normalizeComparisonSettings(models[0], {
      ...defaults(),
      deepResearch: true,
      enabledTools: ["search", "search"],
    }),
  ).toEqual(
    expect.objectContaining({ webSearch: true, deepResearch: true, enabledTools: ["search"] }),
  );
});

test("unconfigured web tools cannot be used", () => {
  expect(
    normalizeComparisonSettings(
      models[0],
      { ...defaults(), webSearch: true, deepResearch: true },
      false,
    ),
  ).toEqual(expect.objectContaining({ webSearch: false, deepResearch: false, enabledTools: [] }));
});

test("settings reject unknown tools, efforts and nonboolean flags", () => {
  for (const invalid of [
    { enabledTools: ["questionnaire"] },
    { enabledTools: ["image"] },
    { reasoningEffort: "huge" },
    { webSearch: "true" },
  ])
    expect(comparisonSettingsSchema.safeParse(invalid).success).toBe(false);
});

const prompt = (search: boolean, browse: boolean) =>
  buildChatSystemPrompt({
    currentDate: "2026-01-01",
    persistentMemory: null,
    projectPrompt: null,
    searchToolEnabled: search,
    browseToolEnabled: browse,
    forceWebSearch: true,
    deepResearch: true,
    interactive: false,
  });
test("comparison prompts never instruct unavailable tools", () => {
  expect(prompt(false, false)).not.toMatch(/search tool|browse tool|questionnaire/);
  expect(prompt(false, true)).toContain("browse tool");
  expect(prompt(false, true)).not.toMatch(/search tool|questionnaire/);
  expect(prompt(true, false)).toContain("search tool");
  expect(prompt(true, false)).not.toMatch(/browse tool|questionnaire/);
  expect(prompt(true, true)).toContain("Web search is required");
});
